import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as httpmod from 'http';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { AppModule } from './../src/app.module';

describe('Step10 (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let ajv: Ajv2020;
  let token: string;

  const http = () => request(app.getHttpServer());
  const authz = () => ({ Authorization: `Bearer ${token}` });

  async function devLoginAs(email: string, displayName: string) {
    const res = await http()
      .post('/api/auth/dev/login')
      .send({ email, displayName })
      .expect(201);
    expect(res.body).toHaveProperty('accessToken');
    return res.body.accessToken as string;
  }

  async function createCircle(name = 'E2E Home'): Promise<string> {
    const res = await http()
      .post('/api/circles')
      .set(authz())
      .send({ name })
      .expect(201);
    expect(res.body).toHaveProperty('circleId');
    return res.body.circleId as string;
  }

  async function registerDevice(circleId: string, haInstanceId: string) {
    const res = await http()
      .post(`/api/circles/${circleId}/edge/devices`)
      .set(authz())
      .send({
        deviceName: 'Local Edge',
        platform: 'home_assistant',
        haInstanceId,
        softwareVersion: '1.0.0',
        publicKey: 'abcdefghijklmnopqrstuvwxyz012345',
        capabilities: {
          fusion: true,
          evidenceUpload: true,
          topomap: false,
        },
      })
      .expect(201);

    return {
      deviceId: res.body.deviceId as string,
      deviceKey: res.body.deviceKey as string,
    };
  }

  async function cleanup(circleId: string, deviceId?: string, eventId?: string) {
    if (eventId) {
      await dataSource.query('DELETE FROM ng_edge_event_summaries_raw WHERE event_id = $1', [eventId]);
      await dataSource.query('DELETE FROM ng_edge_events WHERE event_id = $1', [eventId]);
      await dataSource.query('DELETE FROM ng_edge_ingest_audit WHERE event_id = $1', [eventId]);
      await dataSource.query('DELETE FROM ng_incident_manifests_raw WHERE event_id = $1', [eventId]);
      await dataSource.query('DELETE FROM ng_incident_manifests WHERE event_id = $1', [eventId]);
      await dataSource.query(
        'DELETE FROM ng_evidence_download_leases WHERE ticket_id IN (SELECT ticket_id FROM ng_evidence_access_tickets WHERE event_id = $1)',
        [eventId],
      );
      await dataSource.query('DELETE FROM ng_evidence_access_tickets WHERE event_id = $1', [eventId]);
      await dataSource.query('DELETE FROM ng_evidence_download_audit WHERE event_id = $1', [eventId]);
      await dataSource.query('DELETE FROM ng_event_evidence WHERE event_id = $1', [eventId]);
      // ng_evidence_items is keyed by session_id (no event_id column in v1)
      await dataSource.query(
        `DELETE FROM ng_evidence_items WHERE session_id IN (SELECT id FROM ng_evidence_sessions WHERE event_id = $1)`,
        [eventId],
      );
      await dataSource.query('DELETE FROM ng_evidence_sessions WHERE event_id = $1', [eventId]);
      await dataSource.query('DELETE FROM ng_event_status_idempotency WHERE event_id = $1', [eventId]);
      await dataSource.query('DELETE FROM ng_event_notes WHERE event_id = $1', [eventId]);
      await dataSource.query('DELETE FROM ng_event_idempotency WHERE event_id = $1', [eventId]);
      await dataSource.query('DELETE FROM ng_events WHERE event_id = $1', [eventId]);
    }

    if (deviceId) {
      await dataSource.query('DELETE FROM ng_edge_devices WHERE id = $1', [deviceId]);
    }
    await dataSource.query('DELETE FROM ng_circle_members WHERE circle_id = $1', [circleId]);
    await dataSource.query('DELETE FROM ng_circles WHERE id = $1', [circleId]);
  }

  beforeAll(async () => {
    const modRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modRef.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);

    // AJV used in tests to validate server responses against contract schemas.
    ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
    addFormats(ajv, ['date-time', 'uuid', 'uri']);

    const schemaDirs = [
      path.join(process.cwd(), 'contracts', 'ng-contracts-v1', 'schemas'),
      path.join(process.cwd(), 'contracts', 'ng-contracts-v7.7', 'schemas'),
    ];

    for (const schemaDir of schemaDirs) {
      if (!fs.existsSync(schemaDir)) continue;
      const files = fs
        .readdirSync(schemaDir)
        .filter((f) => f.endsWith('.json'))
        .sort();

      for (const f of files) {
        const raw = fs.readFileSync(path.join(schemaDir, f), 'utf-8');
        ajv.addSchema(JSON.parse(raw));
      }
    }

    token = await devLoginAs('e2e@example.com', 'E2E');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('/health (GET) should report db up', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(res.body.db).toBe('up');
  });

  it('baseline tables should exist (migrations applied)', async () => {
    const rows = await dataSource.query(
      `
      SELECT
        to_regclass('public.ng_edge_devices') AS ng_edge_devices,
        to_regclass('public.ng_events') AS ng_events,
        to_regclass('public.ng_event_idempotency') AS ng_event_idempotency,
        to_regclass('public.ng_event_notes') AS ng_event_notes,
        to_regclass('public.ng_event_status_idempotency') AS ng_event_status_idempotency,
        to_regclass('public.ng_users') AS ng_users,
        to_regclass('public.ng_circles') AS ng_circles,
        to_regclass('public.ng_circle_members') AS ng_circle_members,
        to_regclass('public.ng_edge_event_summaries_raw') AS ng_edge_event_summaries_raw,
        to_regclass('public.ng_edge_events') AS ng_edge_events,
        to_regclass('public.ng_edge_ingest_audit') AS ng_edge_ingest_audit,
        to_regclass('public.ng_incident_manifests_raw') AS ng_incident_manifests_raw,
        to_regclass('public.ng_incident_manifests') AS ng_incident_manifests,
        to_regclass('public.ng_evidence_access_tickets') AS ng_evidence_access_tickets,
        to_regclass('public.ng_evidence_download_audit') AS ng_evidence_download_audit,
        to_regclass('public.ng_evidence_download_leases') AS ng_evidence_download_leases
      `,
    );
    const r = rows?.[0] ?? {};
    expect(r.ng_edge_devices).toBe('ng_edge_devices');
    expect(r.ng_events).toBe('ng_events');
    expect(r.ng_event_idempotency).toBe('ng_event_idempotency');
    expect(r.ng_event_notes).toBe('ng_event_notes');
    expect(r.ng_event_status_idempotency).toBe('ng_event_status_idempotency');
    expect(r.ng_users).toBe('ng_users');
    expect(r.ng_circles).toBe('ng_circles');
    expect(r.ng_circle_members).toBe('ng_circle_members');
    expect(r.ng_edge_event_summaries_raw).toBe('ng_edge_event_summaries_raw');
    expect(r.ng_edge_events).toBe('ng_edge_events');
    expect(r.ng_edge_ingest_audit).toBe('ng_edge_ingest_audit');
    expect(r.ng_incident_manifests_raw).toBe('ng_incident_manifests_raw');
    expect(r.ng_incident_manifests).toBe('ng_incident_manifests');
    expect(r.ng_evidence_access_tickets).toBe('ng_evidence_access_tickets');
    expect(r.ng_evidence_download_audit).toBe('ng_evidence_download_audit');
    expect(r.ng_evidence_download_leases).toBe('ng_evidence_download_leases');
  });

  it('circles membership endpoints should work (list circles, list members, add member)', async () => {
    const circleId = await createCircle('E2E Circle A');

    // Owner should see it in /api/circles
    const myRes = await http().get('/api/circles').set(authz()).expect(200);
    expect(myRes.body).toHaveProperty('circles');
    expect(myRes.body.circles.map((c: any) => c.id)).toContain(circleId);

    // Create another user so we can invite them.
    const token2 = await devLoginAs('e2e2@example.com', 'E2E2');

    // Add member (idempotent)
    const add1 = await http()
      .post(`/api/circles/${circleId}/members`)
      .set(authz())
      .send({ email: 'e2e2@example.com', role: 'neighbor' })
      .expect(201);
    expect(add1.body).toHaveProperty('created', true);

    const add2 = await http()
      .post(`/api/circles/${circleId}/members`)
      .set(authz())
      .send({ email: 'e2e2@example.com', role: 'neighbor' })
      .expect(201);
    expect(add2.body).toHaveProperty('created', false);

    // List members
    const membersRes = await http().get(`/api/circles/${circleId}/members`).set(authz()).expect(200);
    expect(membersRes.body).toHaveProperty('members');
    expect(membersRes.body.members.map((m: any) => m.email)).toContain('e2e2@example.com');

    // Switch auth to user2: they should also see the circle in /api/circles
    const ownerToken = token;
    token = token2;
    const myRes2 = await http().get('/api/circles').set(authz()).expect(200);
    expect(myRes2.body.circles.map((c: any) => c.id)).toContain(circleId);
    token = ownerToken;

    await cleanup(circleId);
  });

  it('POST /events/ingest + GET list + GET detail should match contracts', async () => {
    const circleId = await createCircle();
    const { deviceId, deviceKey } = await registerDevice(circleId, 'ha-test-005');

    // Load a contract example and make it unique per run to avoid collisions.
    const examplePath = path.join(
      process.cwd(),
      'contracts',
      'ng-contracts-v1',
      'examples',
      'event-ingest',
      '01_night_away_break_in_attempt_high.json',
    );
    const example = JSON.parse(fs.readFileSync(examplePath, 'utf-8'));
    example.idempotencyKey = crypto.randomUUID();
    example.event.eventId = crypto.randomUUID();
    example.event.occurredAt = new Date().toISOString();

    const ingest = await http()
      .post(`/api/circles/${circleId}/events/ingest`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(example)
      .expect(201);

    const validateIngest = ajv.getSchema(
      'https://neighborguard.dev/contracts/v1/events.ingest.response.schema.json',
    )!;
    expect(validateIngest(ingest.body)).toBe(true);

    // List
    const list = await http()
      .get(`/api/circles/${circleId}/events?limit=10`)
      .set(authz())
      .expect(200);

    const validateList = ajv.getSchema(
      'https://neighborguard.dev/contracts/v1/events.list.response.schema.json',
    )!;
    expect(validateList(list.body)).toBe(true);

    const summary = list.body.items.find((x: any) => x.eventId === example.event.eventId);
    expect(summary).toBeTruthy();

    // Detail
    const detail = await http()
      .get(`/api/circles/${circleId}/events/${example.event.eventId}`)
      .set(authz())
      .expect(200);

    const validateGet = ajv.getSchema(
      'https://neighborguard.dev/contracts/v1/events.get.response.schema.json',
    )!;
    expect(validateGet(detail.body)).toBe(true);
    expect(detail.body.eventId).toBe(example.event.eventId);
    expect(detail.body.circleId).toBeUndefined(); // contract does not expose circleId

    await cleanup(circleId, deviceId, example.event.eventId);
  });

  it('PATCH status + POST notes should be idempotent and reflect in GET detail', async () => {
    const circleId = await createCircle();
    const { deviceId, deviceKey } = await registerDevice(circleId, 'ha-test-006');

    const examplePath = path.join(
      process.cwd(),
      'contracts',
      'ng-contracts-v1',
      'examples',
      'event-ingest',
      '03_away_suspicious_person_private_20s.json',
    );
    const example = JSON.parse(fs.readFileSync(examplePath, 'utf-8'));
    example.idempotencyKey = crypto.randomUUID();
    example.event.eventId = crypto.randomUUID();
    example.event.occurredAt = new Date().toISOString();
    example.event.status = 'OPEN';

    await http()
      .post(`/api/circles/${circleId}/events/ingest`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(example)
      .expect(201);

    const clientRequestId = crypto.randomUUID();
    const patch1 = await http()
      .patch(`/api/circles/${circleId}/events/${example.event.eventId}/status`)
      .set(authz())
      .send({ status: 'ACKED', note: 'Acked in app', clientRequestId })
      .expect(200);

    const validatePatch = ajv.getSchema(
      'https://neighborguard.dev/contracts/v1/events.status.update.response.schema.json',
    )!;
    expect(validatePatch(patch1.body)).toBe(true);
    expect(patch1.body.status).toBe('ACKED');

    const patch2 = await http()
      .patch(`/api/circles/${circleId}/events/${example.event.eventId}/status`)
      .set(authz())
      .send({ status: 'ACKED', note: 'Acked in app', clientRequestId })
      .expect(200);
    expect(validatePatch(patch2.body)).toBe(true);
    expect(patch2.body.deduped).toBe(true);

    const clientNoteId = crypto.randomUUID();
    const note1 = await http()
      .post(`/api/circles/${circleId}/events/${example.event.eventId}/notes`)
      .set(authz())
      .send({ text: 'Neighbor verified', clientNoteId })
      .expect(201);

    const validateNote = ajv.getSchema(
      'https://neighborguard.dev/contracts/v1/events.notes.create.response.schema.json',
    )!;
    expect(validateNote(note1.body)).toBe(true);
    expect(note1.body.created).toBe(true);

    const note2 = await http()
      .post(`/api/circles/${circleId}/events/${example.event.eventId}/notes`)
      .set(authz())
      .send({ text: 'Neighbor verified', clientNoteId })
      .expect(201);
    expect(validateNote(note2.body)).toBe(true);
    expect(note2.body.created).toBe(false);

    const detail = await http()
      .get(`/api/circles/${circleId}/events/${example.event.eventId}`)
      .set(authz())
      .expect(200);

    const validateGet = ajv.getSchema(
      'https://neighborguard.dev/contracts/v1/events.get.response.schema.json',
    )!;
    expect(validateGet(detail.body)).toBe(true);
    expect(detail.body.status).toBe('ACKED');
    expect(detail.body.ackedAt).toBeDefined();
    expect(Array.isArray(detail.body.notes)).toBe(true);
    expect(detail.body.notes.length).toBeGreaterThanOrEqual(2);

    await cleanup(circleId, deviceId, example.event.eventId);
  });

  it('evidence upload (device) + evidence read (app) should match contracts (mock storage)', async () => {
    const circleId = await createCircle();
    const { deviceId, deviceKey } = await registerDevice(circleId, 'ha-test-evidence');

    // Ingest an event
    const ingestExamplePath = path.join(
      process.cwd(),
      'contracts',
      'ng-contracts-v1',
      'examples',
      'event-ingest',
      '01_night_away_break_in_attempt_high.json',
    );
    const ingestExample = JSON.parse(fs.readFileSync(ingestExamplePath, 'utf-8'));
    const eventId = crypto.randomUUID();
    const ingestReq = {
      ...ingestExample,
      idempotencyKey: crypto.randomUUID(),
      event: {
        ...ingestExample.event,
        eventId,
        occurredAt: new Date().toISOString(),
      },
    };

    await http()
      .post(`/api/circles/${circleId}/events/ingest`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(ingestReq)
      .expect(201);

    const uploadReqPath = path.join(
      process.cwd(),
      'contracts',
      'ng-contracts-v1',
      'examples',
      'evidence.uploadSession.request.example.json',
    );
    const uploadReqExample = JSON.parse(fs.readFileSync(uploadReqPath, 'utf-8'));
    const sha256 = crypto.randomBytes(32).toString('hex');

    const uploadReq = {
      manifest: {
        ...uploadReqExample.manifest,
        items: [
          {
            ...uploadReqExample.manifest.items[0],
            sha256,
            timeRange: {
              startAt: new Date(Date.now() - 60_000).toISOString(),
              endAt: new Date().toISOString(),
            },
          },
        ],
      },
    };

    const uploadRes = await http()
      .post(`/api/circles/${circleId}/events/${eventId}/evidence/upload-session`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(uploadReq)
      .expect(201);

    const validateUploadRes = ajv.getSchema(
      'https://neighborguard.dev/contracts/v1/evidence.uploadSession.response.schema.json',
    )!;
    expect(validateUploadRes(uploadRes.body)).toBe(true);

    const sessionId = uploadRes.body.sessionId as string;

    const completeReqPath = path.join(
      process.cwd(),
      'contracts',
      'ng-contracts-v1',
      'examples',
      'evidence.complete.request.example.json',
    );
    const completeReqExample = JSON.parse(fs.readFileSync(completeReqPath, 'utf-8'));

    const completeReq = {
      ...completeReqExample,
      sessionId,
      manifest: uploadReq.manifest,
      reportPackage: {
        included: true,
        type: 'pdf',
        sha256: crypto.randomBytes(32).toString('hex'),
      },
    };

    const completeRes = await http()
      .post(`/api/circles/${circleId}/events/${eventId}/evidence/complete`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(completeReq)
      .expect(201);

    const validateCompleteRes = ajv.getSchema(
      'https://neighborguard.dev/contracts/v1/evidence.complete.response.schema.json',
    )!;
    expect(validateCompleteRes(completeRes.body)).toBe(true);

    // Step 8+: GET evidence (app bearer)
    const getRes = await http()
      .get(`/api/circles/${circleId}/events/${eventId}/evidence`)
      .set(authz())
      .expect(200);

    const validateGetRes = ajv.getSchema(
      'https://neighborguard.dev/contracts/v1/evidence.get.response.schema.json',
    )!;
    expect(validateGetRes(getRes.body)).toBe(true);

    // download URL (app bearer)
    const dlRes = await http()
      .post(`/api/circles/${circleId}/events/${eventId}/evidence/items/${sha256}/download-url`)
      .set(authz())
      .send({})
      .expect(201);

    const validateDlRes = ajv.getSchema(
      'https://neighborguard.dev/contracts/v1/evidence.downloadUrl.response.schema.json',
    )!;
    expect(validateDlRes(dlRes.body)).toBe(true);

    await cleanup(circleId, deviceId, eventId);
  });

  it('GET missing event should return 404 with contract error envelope', async () => {
    const circleId = await createCircle();
    const { deviceId } = await registerDevice(circleId, 'ha-test-404');

    const missingEventId = crypto.randomUUID();

    const r = await http()
      .get(`/api/circles/${circleId}/events/${missingEventId}`)
      .set(authz())
      .expect(404);

    const validateErr = ajv.getSchema(
      'https://neighborguard.dev/contracts/v1/error.response.schema.json',
    )!;
    expect(validateErr(r.body)).toBe(true);

    await cleanup(circleId, deviceId);
  });

  it('POST /edge/events/summary-upsert should accept v7.7, store raw, and upsert snapshot (applied)', async () => {
    const circleId = await createCircle('E2E v7.7 Circle');
    const { deviceId, deviceKey } = await registerDevice(circleId, 'ha-test-v77-001');

    const payload = {
      schemaVersion: 'v7.7',
      circleId,
      eventId: crypto.randomUUID(),
      edgeInstanceId: 'edge-e2e-01',
      threatState: 'TRIGGERED',
      updatedAt: new Date().toISOString(),
      sequence: 1,
      summary: { mode: 'NIGHT', workflowClass: 'PERIMETER' },
    };

    const r = await http()
      .post(`/api/circles/${circleId}/edge/events/summary-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(payload)
      .expect(201);

    expect(r.body).toHaveProperty('ok', true);
    expect(r.body).toHaveProperty('applied', true);
    expect(r.body).toHaveProperty('reason', 'applied');

    const rows = await dataSource.query(
      'SELECT circle_id, event_id, edge_instance_id, threat_state FROM ng_edge_event_summaries_raw WHERE event_id = $1',
      [payload.eventId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].circle_id).toBe(circleId);
    expect(rows[0].edge_instance_id).toBe(payload.edgeInstanceId);
    expect(rows[0].threat_state).toBe(payload.threatState);

    const snap = await dataSource.query(
      'SELECT circle_id, event_id, edge_instance_id, threat_state, last_sequence FROM ng_edge_events WHERE event_id = $1',
      [payload.eventId],
    );
    expect(snap.length).toBe(1);
    expect(snap[0].circle_id).toBe(circleId);
    expect(snap[0].edge_instance_id).toBe(payload.edgeInstanceId);
    expect(snap[0].threat_state).toBe(payload.threatState);
    expect(Number(snap[0].last_sequence)).toBe(1);

    await cleanup(circleId, deviceId, payload.eventId);
  });

  it('POST /edge/events/summary-upsert should reject stale_sequence and not update snapshot', async () => {
    const circleId = await createCircle('E2E v7.7 Circle 2');
    const { deviceId, deviceKey } = await registerDevice(circleId, 'ha-test-v77-002');

    const eventId = crypto.randomUUID();
    const t1 = new Date();
    const t2 = new Date(t1.getTime() + 1000);

    const p10 = {
      schemaVersion: 'v7.7',
      circleId,
      eventId,
      edgeInstanceId: 'edge-e2e-02',
      threatState: 'TRIGGERED',
      updatedAt: t1.toISOString(),
      sequence: 10,
    };
    await http()
      .post(`/api/circles/${circleId}/edge/events/summary-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(p10)
      .expect(201);

    const p9 = { ...p10, threatState: 'PENDING', updatedAt: t2.toISOString(), sequence: 9 };
    const r = await http()
      .post(`/api/circles/${circleId}/edge/events/summary-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(p9)
      .expect(201);

    expect(r.body).toHaveProperty('applied', false);
    expect(r.body).toHaveProperty('reason', 'stale_sequence');

    const snap = await dataSource.query(
      'SELECT threat_state, last_sequence FROM ng_edge_events WHERE event_id = $1',
      [eventId],
    );
    expect(snap.length).toBe(1);
    expect(snap[0].threat_state).toBe('TRIGGERED');
    expect(Number(snap[0].last_sequence)).toBe(10);

    await cleanup(circleId, deviceId, eventId);
  });

  it('POST /edge/events/summary-upsert should reject stale_timestamp for same sequence', async () => {
    const circleId = await createCircle('E2E v7.7 Circle 3');
    const { deviceId, deviceKey } = await registerDevice(circleId, 'ha-test-v77-003');

    const eventId = crypto.randomUUID();
    const t1 = new Date();
    const t2 = new Date(t1.getTime() + 1000);

    const p = {
      schemaVersion: 'v7.7',
      circleId,
      eventId,
      edgeInstanceId: 'edge-e2e-03',
      threatState: 'PENDING',
      updatedAt: t2.toISOString(),
      sequence: 5,
    };
    await http()
      .post(`/api/circles/${circleId}/edge/events/summary-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(p)
      .expect(201);

    const olderSameSeq = { ...p, threatState: 'TRIGGERED', updatedAt: t1.toISOString(), sequence: 5 };
    const r = await http()
      .post(`/api/circles/${circleId}/edge/events/summary-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(olderSameSeq)
      .expect(201);

    expect(r.body).toHaveProperty('applied', false);
    expect(r.body).toHaveProperty('reason', 'stale_timestamp');

    const snap = await dataSource.query(
      'SELECT threat_state, edge_updated_at, last_sequence FROM ng_edge_events WHERE event_id = $1',
      [eventId],
    );
    expect(snap.length).toBe(1);
    expect(snap[0].threat_state).toBe('PENDING');
    expect(Number(snap[0].last_sequence)).toBe(5);

    await cleanup(circleId, deviceId, eventId);
  });

  it('POST /edge/events/summary-upsert should return duplicate_payload for identical retry', async () => {
    const circleId = await createCircle('E2E v7.7 Circle 4');
    const { deviceId, deviceKey } = await registerDevice(circleId, 'ha-test-v77-004');

    const eventId = crypto.randomUUID();
    const t1 = new Date();

    const p = {
      schemaVersion: 'v7.7',
      circleId,
      eventId,
      edgeInstanceId: 'edge-e2e-04',
      threatState: 'TRIGGERED',
      updatedAt: t1.toISOString(),
      sequence: 10,
      summary: { any: 'thing' },
    };

    const r1 = await http()
      .post(`/api/circles/${circleId}/edge/events/summary-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(p)
      .expect(201);
    expect(r1.body).toHaveProperty('applied', true);

    const r2 = await http()
      .post(`/api/circles/${circleId}/edge/events/summary-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(p)
      .expect(201);
    expect(r2.body).toHaveProperty('applied', false);
    expect(r2.body).toHaveProperty('reason', 'duplicate_payload');

    const audit = await dataSource.query(
      'SELECT applied, reason FROM ng_edge_ingest_audit WHERE circle_id = $1 AND event_id = $2 ORDER BY received_at ASC',
      [circleId, eventId],
    );
    expect(audit.length).toBe(2);
    expect(audit[0].applied).toBe(true);
    expect(audit[0].reason).toBe('applied');
    expect(audit[1].applied).toBe(false);
    expect(audit[1].reason).toBe('duplicate_payload');

    await cleanup(circleId, deviceId, eventId);
  });

  it('POST /edge/events/summary-upsert should allow same-sequence update when updatedAt is newer and payload differs', async () => {
    const circleId = await createCircle('E2E v7.7 Circle 5');
    const { deviceId, deviceKey } = await registerDevice(circleId, 'ha-test-v77-005');

    const eventId = crypto.randomUUID();
    const t1 = new Date();
    const t2 = new Date(t1.getTime() + 2000);

    const p1 = {
      schemaVersion: 'v7.7',
      circleId,
      eventId,
      edgeInstanceId: 'edge-e2e-05',
      threatState: 'PENDING',
      updatedAt: t1.toISOString(),
      sequence: 7,
      summary: { step: 1 },
    };
    await http()
      .post(`/api/circles/${circleId}/edge/events/summary-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(p1)
      .expect(201);

    const p2 = { ...p1, threatState: 'TRIGGERED', updatedAt: t2.toISOString(), summary: { step: 2 } };
    const r2 = await http()
      .post(`/api/circles/${circleId}/edge/events/summary-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(p2)
      .expect(201);
    expect(r2.body).toHaveProperty('applied', true);
    expect(r2.body).toHaveProperty('reason', 'applied');

    const snap = await dataSource.query(
      'SELECT threat_state, edge_updated_at, last_sequence FROM ng_edge_events WHERE event_id = $1',
      [eventId],
    );
    expect(snap.length).toBe(1);
    expect(snap[0].threat_state).toBe('TRIGGERED');
    expect(Number(snap[0].last_sequence)).toBe(7);

    await cleanup(circleId, deviceId, eventId);
  });

  it('POST /edge/events/:eventId/incident/manifest-upsert should accept v7.7 and upsert manifest (applied)', async () => {
    const circleId = await createCircle('E2E v7.7 Manifest 1');
    const { deviceId, deviceKey } = await registerDevice(circleId, 'ha-test-v77-m01');

    const eventId = crypto.randomUUID();
    const p = {
      schemaVersion: 'v7.7',
      circleId,
      eventId,
      edgeInstanceId: 'edge-e2e-m01',
      updatedAt: new Date().toISOString(),
      sequence: 1,
      manifest: { items: [{ kind: 'clip', sha256: 'deadbeef', durMs: 1000 }] },
    };

    const r = await http()
      .post(`/api/circles/${circleId}/edge/events/${eventId}/incident/manifest-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(p)
      .expect(201);

    expect(r.body).toHaveProperty('ok', true);
    expect(r.body).toHaveProperty('applied', true);
    expect(r.body).toHaveProperty('reason', 'applied');

    const raw = await dataSource.query(
      'SELECT circle_id, event_id, edge_instance_id FROM ng_incident_manifests_raw WHERE event_id = $1',
      [eventId],
    );
    expect(raw.length).toBe(1);

    const snap = await dataSource.query(
      'SELECT circle_id, event_id, edge_instance_id, last_sequence FROM ng_incident_manifests WHERE event_id = $1',
      [eventId],
    );
    expect(snap.length).toBe(1);
    expect(Number(snap[0].last_sequence)).toBe(1);

    await cleanup(circleId, deviceId, eventId);
  });

  it('POST /edge/events/:eventId/incident/manifest-upsert should reject stale_sequence', async () => {
    const circleId = await createCircle('E2E v7.7 Manifest 2');
    const { deviceId, deviceKey } = await registerDevice(circleId, 'ha-test-v77-m02');

    const eventId = crypto.randomUUID();
    const t1 = new Date();
    const t2 = new Date(t1.getTime() + 1000);

    const p10 = {
      schemaVersion: 'v7.7',
      circleId,
      eventId,
      edgeInstanceId: 'edge-e2e-m02',
      updatedAt: t1.toISOString(),
      sequence: 10,
      manifest: { v: 10 },
    };
    await http()
      .post(`/api/circles/${circleId}/edge/events/${eventId}/incident/manifest-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(p10)
      .expect(201);

    const p9 = { ...p10, updatedAt: t2.toISOString(), sequence: 9, manifest: { v: 9 } };
    const r = await http()
      .post(`/api/circles/${circleId}/edge/events/${eventId}/incident/manifest-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(p9)
      .expect(201);
    expect(r.body).toHaveProperty('applied', false);
    expect(r.body).toHaveProperty('reason', 'stale_sequence');

    const snap = await dataSource.query(
      'SELECT last_sequence FROM ng_incident_manifests WHERE event_id = $1',
      [eventId],
    );
    expect(Number(snap[0].last_sequence)).toBe(10);

    await cleanup(circleId, deviceId, eventId);
  });

  it('POST /edge/events/:eventId/incident/manifest-upsert should return duplicate_payload for identical retry', async () => {
    const circleId = await createCircle('E2E v7.7 Manifest 3');
    const { deviceId, deviceKey } = await registerDevice(circleId, 'ha-test-v77-m03');

    const eventId = crypto.randomUUID();
    const p = {
      schemaVersion: 'v7.7',
      circleId,
      eventId,
      edgeInstanceId: 'edge-e2e-m03',
      updatedAt: new Date().toISOString(),
      sequence: 2,
      manifest: { hello: 'world' },
    };
    await http()
      .post(`/api/circles/${circleId}/edge/events/${eventId}/incident/manifest-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(p)
      .expect(201);

    const r2 = await http()
      .post(`/api/circles/${circleId}/edge/events/${eventId}/incident/manifest-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(p)
      .expect(201);
    expect(r2.body).toHaveProperty('applied', false);
    expect(r2.body).toHaveProperty('reason', 'duplicate_payload');

    const audit = await dataSource.query(
      "SELECT applied, reason, message_type FROM ng_edge_ingest_audit WHERE circle_id = $1 AND event_id = $2 ORDER BY received_at ASC",
      [circleId, eventId],
    );
    // At least 2 entries from manifest upserts; ignore any others.
    const manifestRows = audit.filter((x: any) => x.message_type === 'incident_manifest_upsert');
    expect(manifestRows.length).toBe(2);
    expect(manifestRows[1].reason).toBe('duplicate_payload');

    await cleanup(circleId, deviceId, eventId);
  });

  it('GET /events/:eventId/incident/manifest (app) and POST /evidence/tickets should work', async () => {
    const circleId = await createCircle('E2E v7.7 Circle 8');
    const { deviceId, deviceKey } = await registerDevice(circleId, 'ha-test-v77-008');

    const eventId = crypto.randomUUID();
    const t1 = new Date();
    const evidenceKey = `clip:cam_front:${crypto.randomUUID()}`;
    const slowEvidenceKey = `clip:cam_front:${crypto.randomUUID()}`;
    // Stand up a tiny local HTTP server to simulate an edge evidence URL.
    const content = `hello-evidence-${crypto.randomUUID()}`;
    const server = httpmod.createServer((req, res) => {
      if (req.url === '/evidence.txt' || req.url === '/slow.txt') {
        const buf = Buffer.from(content, 'utf8');
        const range = req.headers['range'];

        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Accept-Ranges', 'bytes');

        if (req.method === 'HEAD') {
          res.statusCode = 200;
          res.setHeader('Content-Length', String(buf.length));
          res.end();
          return;
        }

        if (typeof range === 'string' && range.startsWith('bytes=')) {
          const m = /^bytes=(\d+)-(\d+)?$/.exec(range);
          if (!m) {
            res.statusCode = 416;
            res.end('range not satisfiable');
            return;
          }
          const start = Number(m[1]);
          const end = m[2] ? Number(m[2]) : buf.length - 1;
          if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= buf.length) {
            res.statusCode = 416;
            res.end('range not satisfiable');
            return;
          }
          const slice = buf.subarray(start, Math.min(end + 1, buf.length));
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${start + slice.length - 1}/${buf.length}`);
          res.setHeader('Content-Length', String(slice.length));
          res.end(slice);
          return;
        }

        const send = () => {
          res.statusCode = 200;
          res.setHeader('Content-Length', String(buf.length));
          res.end(buf);
        };
        // slow endpoint used to test concurrency leases
        if (req.url === '/slow.txt') {
          setTimeout(send, 800);
        } else {
          send();
        }
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const edgeUrl = `http://127.0.0.1:${port}/evidence.txt`;
    const edgeUrlSlow = `http://127.0.0.1:${port}/slow.txt`;

    const upsertReq = {
      schemaVersion: 'v7.7',
      circleId,
      eventId,
      edgeInstanceId: 'edge-e2e-08',
      updatedAt: t1.toISOString(),
      sequence: 1,
      manifest: {
        items: [
          {
            evidenceKey,
            kind: 'clip',
            edgeUrl,
            timeRange: { startAt: t1.toISOString(), endAt: t1.toISOString() },
          },
          {
            evidenceKey: slowEvidenceKey,
            kind: 'clip',
            edgeUrl: edgeUrlSlow,
            timeRange: { startAt: t1.toISOString(), endAt: t1.toISOString() },
          },
        ],
      },
    };

    await http()
      .post(`/api/circles/${circleId}/edge/events/${eventId}/incident/manifest-upsert`)
      .set('Authorization', `Device ${deviceKey}`)
      .send(upsertReq)
      .expect(201);

    const getRes = await http()
      .get(`/api/circles/${circleId}/events/${eventId}/incident/manifest`)
      .set(authz())
      .expect(200);

    const validateGet = ajv.getSchema(
      'https://neighborguard.dev/contracts/v7.7/app.incidentManifest.get.response.schema.json',
    )!;
    expect(validateGet(getRes.body)).toBe(true);
    expect(getRes.body.eventId).toBe(eventId);
    expect(getRes.body.manifest).toBeDefined();

    const ticketRes = await http()
      .post(`/api/circles/${circleId}/events/${eventId}/evidence/tickets`)
      .set(authz())
      .send({ evidenceKey, ttlSec: 600 })
      .expect(201);

    // Second ticket used to test concurrency lease behavior.
    const slowTicketRes1 = await http()
      .post(`/api/circles/${circleId}/events/${eventId}/evidence/tickets`)
      .set(authz())
      .send({ evidenceKey: slowEvidenceKey, ttlSec: 600 })
      .expect(201);

    const validateTicket = ajv.getSchema(
      'https://neighborguard.dev/contracts/v7.7/app.evidenceTicket.create.response.schema.json',
    )!;
    expect(validateTicket(ticketRes.body)).toBe(true);
    expect(ticketRes.body.evidenceKey).toBe(evidenceKey);
    expect(ticketRes.body.accessMode).toBe('TICKET_ONLY');

    const resolveRes = await http()
      .get(`/api/evidence/tickets/${ticketRes.body.ticketId}/resolve`)
      .set(authz())
      .expect(200);

    const validateResolve = ajv.getSchema(
      'https://neighborguard.dev/contracts/v7.7/app.evidenceTicket.resolve.response.schema.json',
    )!;
    expect(validateResolve(resolveRes.body)).toBe(true);
    expect(resolveRes.body.ticketId).toBe(ticketRes.body.ticketId);
    expect(resolveRes.body.evidenceKey).toBe(evidenceKey);
    expect(resolveRes.body.mode).toBe('EDGE_DIRECT_URL');
    expect(resolveRes.body.url).toBe(edgeUrl);

    // Ticket should be scoped to requester user (prevent forwarding).
    const token2 = await devLoginAs('e2e-forward@example.com', 'E2E Forward');
    await http()
      .get(`/api/evidence/tickets/${ticketRes.body.ticketId}/resolve`)
      .set({ Authorization: `Bearer ${token2}` })
      .expect(403);

    // Metadata (HEAD/probe) via server.
    const metaRes = await http()
      .get(`/api/evidence/tickets/${ticketRes.body.ticketId}/meta`)
      .set(authz())
      .expect(200);

    const validateMeta = ajv.getSchema(
      'https://neighborguard.dev/contracts/v7.7/app.evidenceTicket.meta.response.schema.json',
    )!;
    expect(validateMeta(metaRes.body)).toBe(true);
    expect(metaRes.body.ticketId).toBe(ticketRes.body.ticketId);
    expect(metaRes.body.evidenceKey).toBe(evidenceKey);
    expect(metaRes.body.contentType).toContain('text/plain');
    expect(metaRes.body.contentLength).toBe(content.length);

    // Concurrency limit: same ticket cannot be downloaded concurrently.
    const slowTicketRes = await http()
      .post(`/api/circles/${circleId}/events/${eventId}/evidence/tickets`)
      .set(authz())
      .send({ evidenceKey: slowEvidenceKey, ttlSec: 600 })
      .expect(201);

    const slowDownload = http()
      .get(`/api/evidence/tickets/${slowTicketRes.body.ticketId}/download`)
      .set(authz())
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);


    // Kick off the first download request so the server acquires the lease before we attempt a second one.
    const slowDownloadPromise = slowDownload.then((r) => r);
    await new Promise((r) => setTimeout(r, 50));

    // Second concurrent download should be rejected.
    await http()
      .get(`/api/evidence/tickets/${slowTicketRes.body.ticketId}/download`)
      .set(authz())
      .expect(429);

    const slowDownloadRes = await slowDownloadPromise;
    expect((slowDownloadRes.body as Buffer).toString('utf8')).toBe(content);

    // Purge expired tickets/leases.
    const shortTicketRes = await http()
      .post(`/api/circles/${circleId}/events/${eventId}/evidence/tickets`)
      .set(authz())
      .send({ evidenceKey, ttlSec: 1 })
      .expect(201);
    await new Promise((r) => setTimeout(r, 1100));
    await http().post('/api/admin/maintenance/purge-expired').set(authz()).send({}).expect(201);
    await http()
      .get(`/api/evidence/tickets/${shortTicketRes.body.ticketId}/resolve`)
      .set(authz())
      .expect(404);

    // Download via server proxy.
    const downloadRes = await http()
      .get(`/api/evidence/tickets/${ticketRes.body.ticketId}/download`)
      .set(authz())
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(downloadRes.headers['content-type']).toContain('text/plain');
    expect((downloadRes.body as Buffer).toString('utf8')).toBe(content);

    // Range download via server proxy.
    const rangeRes = await http()
      .get(`/api/evidence/tickets/${ticketRes.body.ticketId}/download`)
      .set(authz())
      .set('Range', 'bytes=0-4')
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(206);
    expect(rangeRes.headers['content-range']).toBeDefined();
    expect((rangeRes.body as Buffer).toString('utf8')).toBe(content.slice(0, 5));

    const dlAudit = await dataSource.query(
      'SELECT requested_range, upstream_status FROM ng_evidence_download_audit WHERE event_id = $1 AND evidence_key = $2 ORDER BY created_at ASC',
      [eventId, evidenceKey],
    );
    // meta + full download + range download
    expect(dlAudit.length).toBe(3);
    expect(dlAudit[0].requested_range).toBeNull();
    expect(dlAudit[1].requested_range).toBeNull();
    expect(dlAudit[2].requested_range).toBe('bytes=0-4');
    expect(dlAudit[0].upstream_status).toBe(200);

    await new Promise<void>((resolve) => server.close(() => resolve()));

    await cleanup(circleId, deviceId, eventId);
  });
});