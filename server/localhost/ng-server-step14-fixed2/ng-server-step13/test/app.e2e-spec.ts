import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
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

    const schemaDir = path.join(process.cwd(), 'contracts', 'ng-contracts-v1', 'schemas');
    const files = fs
      .readdirSync(schemaDir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    for (const f of files) {
      const raw = fs.readFileSync(path.join(schemaDir, f), 'utf-8');
      ajv.addSchema(JSON.parse(raw));
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
        to_regclass('public.ng_circle_members') AS ng_circle_members;
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
});
