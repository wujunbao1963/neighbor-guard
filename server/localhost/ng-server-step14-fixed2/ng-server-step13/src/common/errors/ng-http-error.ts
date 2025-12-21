import { HttpException, HttpStatus } from '@nestjs/common';

export type NgErrorBody = {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  timestamp: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterSec?: number;
};

/**
 * Contract-aligned HTTP error with a stable machine code.
 */
export class NgHttpError extends HttpException {
  readonly body: NgErrorBody;

  constructor(body: NgErrorBody) {
    super(body, body.statusCode);
    this.body = body;
  }
}

export const NgErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  EVENT_CONFLICT: 'EVENT_CONFLICT',
  INTERNAL: 'INTERNAL',
} as const;

export function makeValidationError(details: unknown): NgHttpError {
  return new NgHttpError({
    statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    error: 'Unprocessable Entity',
    code: NgErrorCodes.VALIDATION_ERROR,
    message: 'Request validation failed',
    timestamp: new Date().toISOString(),
    details: { validationErrors: details },
    retryable: false,
  });
}

export function makeNotFoundError(message = 'Not Found', details?: unknown): NgHttpError {
  return new NgHttpError({
    statusCode: 404,
    error: 'Not Found',
    code: 'NOT_FOUND',
    message,
    timestamp: new Date().toISOString(),
    details,
    retryable: false,
  });
}
