import { Injectable } from '@nestjs/common';
import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: ErrorObject[] };

@Injectable()
export class ContractsValidatorService {
  // Contracts declare draft 2020-12; Ajv2020 ships with the correct meta-schema.
  private readonly ajv: Ajv2020;

  private readonly validateIngestReq: ValidateFunction;
  private readonly validateEventsListResp: ValidateFunction;
  private readonly validateEventsGetResp: ValidateFunction;
  private readonly validateStatusUpdateReq: ValidateFunction;
  private readonly validateStatusUpdateResp: ValidateFunction;
  private readonly validateNotesCreateReq: ValidateFunction;
  private readonly validateNotesCreateResp: ValidateFunction;
  private readonly validateTopoMapFn: ValidateFunction;
  private readonly validateTopoMapReq: ValidateFunction;
  private readonly validateTopoMapResp: ValidateFunction;

  private readonly validateDeviceRegisterReq: ValidateFunction;
  private readonly validateDeviceRegisterResp: ValidateFunction;

  private readonly validateEdgeEventSummaryUpsertReq: ValidateFunction;
  private readonly validateEdgeIncidentManifestUpsertReq: ValidateFunction;

  private readonly validateAppIncidentManifestGetResp: ValidateFunction;
  private readonly validateAppEvidenceTicketCreateReq: ValidateFunction;
  private readonly validateAppEvidenceTicketCreateResp: ValidateFunction;
  private readonly validateAppEvidenceTicketResolveResp: ValidateFunction;
  private readonly validateAppEvidenceTicketMetaResp: ValidateFunction;

  constructor() {
    this.ajv = new Ajv2020({
      strict: false,
      allErrors: true,
      allowUnionTypes: true,
    });
    addFormats(this.ajv, ['date-time', 'uuid', 'uri']);

    this.loadSchemas();

    this.validateIngestReq = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v1/events.ingest.request.schema.json',
    );
    this.validateEventsListResp = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v1/events.list.response.schema.json',
    );
    this.validateEventsGetResp = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v1/events.get.response.schema.json',
    );

    this.validateStatusUpdateReq = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v1/events.status.update.request.schema.json',
    );
    this.validateStatusUpdateResp = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v1/events.status.update.response.schema.json',
    );
    this.validateNotesCreateReq = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v1/events.notes.create.request.schema.json',
    );
    this.validateNotesCreateResp = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v1/events.notes.create.response.schema.json',
    );

    this.validateTopoMapFn = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v1/topomap.schema.json',
    );


    this.validateTopoMapReq = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v1/topomap.schema.json',
    );
    this.validateTopoMapResp = this.validateTopoMapReq;

    this.validateDeviceRegisterReq = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v1/device.register.request.schema.json',
    );
    this.validateDeviceRegisterResp = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v1/device.register.response.schema.json',
    );

    this.validateEdgeEventSummaryUpsertReq = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v7.7/edge.eventSummaryUpsert.schema.json',
    );

    this.validateEdgeIncidentManifestUpsertReq = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v7.7/edge.incidentManifestUpsert.schema.json',
    );

    this.validateAppIncidentManifestGetResp = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v7.7/app.incidentManifest.get.response.schema.json',
    );
    this.validateAppEvidenceTicketCreateReq = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v7.7/app.evidenceTicket.create.request.schema.json',
    );
    this.validateAppEvidenceTicketCreateResp = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v7.7/app.evidenceTicket.create.response.schema.json',
    );

    this.validateAppEvidenceTicketResolveResp = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v7.7/app.evidenceTicket.resolve.response.schema.json',
    );

    this.validateAppEvidenceTicketMetaResp = this.mustGetSchema(
      'https://neighborguard.dev/contracts/v7.7/app.evidenceTicket.meta.response.schema.json',
    );
  }

  validateEventsIngestRequest(body: unknown): ValidationResult {
    const ok = this.validateIngestReq(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateIngestReq.errors ?? [] };
  }

  validateEventsListResponse(body: unknown): ValidationResult {
    const ok = this.validateEventsListResp(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateEventsListResp.errors ?? [] };
  }

  validateEventsGetResponse(body: unknown): ValidationResult {
    const ok = this.validateEventsGetResp(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateEventsGetResp.errors ?? [] };
  }

  validateStatusUpdateRequest(body: unknown): ValidationResult {
    const ok = this.validateStatusUpdateReq(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateStatusUpdateReq.errors ?? [] };
  }

  validateStatusUpdateResponse(body: unknown): ValidationResult {
    const ok = this.validateStatusUpdateResp(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateStatusUpdateResp.errors ?? [] };
  }

  validateNotesCreateRequest(body: unknown): ValidationResult {
    const ok = this.validateNotesCreateReq(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateNotesCreateReq.errors ?? [] };
  }

  validateNotesCreateResponse(body: unknown): ValidationResult {
    const ok = this.validateNotesCreateResp(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateNotesCreateResp.errors ?? [] };
  }

  validateDeviceRegisterRequest(body: unknown): ValidationResult {
    const ok = this.validateDeviceRegisterReq(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateDeviceRegisterReq.errors ?? [] };
  }

  validateDeviceRegisterResponse(body: unknown): ValidationResult {
    const ok = this.validateDeviceRegisterResp(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateDeviceRegisterResp.errors ?? [] };
  }

  validateAppIncidentManifestGetResponse(body: unknown): ValidationResult {
    const ok = this.validateAppIncidentManifestGetResp(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateAppIncidentManifestGetResp.errors ?? [] };
  }

  validateAppEvidenceTicketCreateRequest(body: unknown): ValidationResult {
    const ok = this.validateAppEvidenceTicketCreateReq(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateAppEvidenceTicketCreateReq.errors ?? [] };
  }

  validateAppEvidenceTicketCreateResponse(body: unknown): ValidationResult {
    const ok = this.validateAppEvidenceTicketCreateResp(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateAppEvidenceTicketCreateResp.errors ?? [] };
  }

  validateAppEvidenceTicketResolveResponse(body: unknown): ValidationResult {
    const ok = this.validateAppEvidenceTicketResolveResp(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateAppEvidenceTicketResolveResp.errors ?? [] };
  }

  validateAppEvidenceTicketMetaResponse(body: unknown): ValidationResult {
    const ok = this.validateAppEvidenceTicketMetaResp(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateAppEvidenceTicketMetaResp.errors ?? [] };
  }

 

  validateTopoMapRequest(body: unknown): ValidationResult {
    const ok = this.validateTopoMapReq(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateTopoMapReq.errors ?? [] };
  }

  validateTopoMapResponse(body: unknown): ValidationResult {
    const ok = this.validateTopoMapResp(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateTopoMapResp.errors ?? [] };
  }
validateEvidenceUploadSessionRequest(body: unknown): ValidationResult {
  const fn = this.mustGetSchema(
    'https://neighborguard.dev/contracts/v1/evidence.uploadSession.request.schema.json',
  );
  const ok = fn(body);
  return ok ? { ok: true } : { ok: false, errors: fn.errors ?? [] };
}

validateEvidenceUploadSessionResponse(body: unknown): ValidationResult {
  const fn = this.mustGetSchema(
    'https://neighborguard.dev/contracts/v1/evidence.uploadSession.response.schema.json',
  );
  const ok = fn(body);
  return ok ? { ok: true } : { ok: false, errors: fn.errors ?? [] };
}

validateEvidenceCompleteRequest(body: unknown): ValidationResult {
  const fn = this.mustGetSchema(
    'https://neighborguard.dev/contracts/v1/evidence.complete.request.schema.json',
  );
  const ok = fn(body);
  return ok ? { ok: true } : { ok: false, errors: fn.errors ?? [] };
}

validateEvidenceCompleteResponse(body: unknown): ValidationResult {
  const fn = this.mustGetSchema(
    'https://neighborguard.dev/contracts/v1/evidence.complete.response.schema.json',
  );
  const ok = fn(body);
  return ok ? { ok: true } : { ok: false, errors: fn.errors ?? [] };
}


validateEvidenceGetResponse(body: unknown): ValidationResult {
  const fn = this.mustGetSchema(
    'https://neighborguard.dev/contracts/v1/evidence.get.response.schema.json',
  );
  const ok = fn(body);
  return ok ? { ok: true } : { ok: false, errors: fn.errors ?? [] };
}

validateEvidenceDownloadUrlResponse(body: unknown): ValidationResult {
  const fn = this.mustGetSchema(
    'https://neighborguard.dev/contracts/v1/evidence.downloadUrl.response.schema.json',
  );
  const ok = fn(body);
  return ok ? { ok: true } : { ok: false, errors: fn.errors ?? [] };
}

  validateTopoMap(body: unknown): ValidationResult {
    const ok = this.validateTopoMapFn(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateTopoMapFn.errors ?? [] };
  }


  private validate(fn: ValidateFunction, body: unknown): ValidationResult {
    const ok = fn(body);
    if (ok) return { ok: true };
    return { ok: false, errors: fn.errors ?? [] };
  }

  private mustGetSchema(schemaId: string): ValidateFunction {
    const fn = this.ajv.getSchema(schemaId) as ValidateFunction | undefined;
    if (!fn) {
      throw new Error(`Failed to compile schema: ${schemaId}`);
    }
    return fn;
  }
  validateEdgeEventSummaryUpsertRequest(body: unknown): ValidationResult {
    const ok = this.validateEdgeEventSummaryUpsertReq(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateEdgeEventSummaryUpsertReq.errors ?? [] };
  }

  validateEdgeIncidentManifestUpsertRequest(body: unknown): ValidationResult {
    const ok = this.validateEdgeIncidentManifestUpsertReq(body);
    if (ok) return { ok: true };
    return { ok: false, errors: this.validateEdgeIncidentManifestUpsertReq.errors ?? [] };
  }


  private loadSchemas(): void {
    const roots = [
      path.join(process.cwd(), 'contracts', 'ng-contracts-v1', 'schemas'),
      path.join(process.cwd(), 'contracts', 'ng-contracts-v7.7', 'schemas'),
    ];

    for (const base of roots) {
      if (!fs.existsSync(base)) continue;
      const files = fs
        .readdirSync(base)
        .filter((f) => f.endsWith('.json'))
        .sort();

      for (const f of files) {
        const p = path.join(base, f);
        const raw = fs.readFileSync(p, 'utf-8');
        const json = JSON.parse(raw);
        this.ajv.addSchema(json);
      }
    }
  }

  // For tests / future steps.
  getAjv(): Ajv2020 {
    return this.ajv;
  }
}
