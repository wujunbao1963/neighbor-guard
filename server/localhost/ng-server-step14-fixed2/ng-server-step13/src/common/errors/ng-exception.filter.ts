import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { NgErrorCodes, NgErrorBody, NgHttpError } from './ng-http-error';

@Catch()
export class NgExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<any>();

    if (exception instanceof NgHttpError) {
      const body = normalizeBody(exception.body);
      res.status(body.statusCode).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = exception.getResponse() as any;

      // Nest default payload is often: { statusCode, message, error }
      const message =
        typeof payload === 'string'
          ? payload
          : Array.isArray(payload?.message)
            ? payload.message.join('; ')
            : payload?.message ?? exception.message;

      const code = mapHttpStatusToCode(statusCode);

      const errorText =
        typeof payload === 'object' && typeof payload?.error === 'string'
          ? payload.error
          : httpStatusName(statusCode);

      const details =
        typeof payload === 'object' && payload?.message
          ? { messages: payload.message }
          : typeof payload === 'object' && payload !== null
            ? (payload as Record<string, unknown>)
            : { value: payload };

      const body: NgErrorBody = {
        statusCode,
        error: errorText,
        code,
        message,
        timestamp: new Date().toISOString(),
        details,
        retryable: isRetryable(statusCode),
      };

      res.status(statusCode).json(body);
      return;
    }

    const body: NgErrorBody = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: httpStatusName(HttpStatus.INTERNAL_SERVER_ERROR),
      code: NgErrorCodes.INTERNAL,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
      retryable: true,
    };

    res.status(body.statusCode).json(body);
  }
}

function normalizeBody(body: NgErrorBody): NgErrorBody {
  return {
    ...body,
    error: body.error || httpStatusName(body.statusCode),
    timestamp: body.timestamp || new Date().toISOString(),
    details:
      body.details && typeof body.details === 'object' && !Array.isArray(body.details)
        ? body.details
        : body.details === undefined
          ? undefined
          : { value: body.details },
  };
}

function httpStatusName(status: number): string {
  return (HttpStatus as any)[status] ?? 'Error';
}

function mapHttpStatusToCode(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return NgErrorCodes.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return NgErrorCodes.FORBIDDEN;
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return NgErrorCodes.VALIDATION_ERROR;
    default:
      return `HTTP_${status}`;
  }
}

function isRetryable(status: number): boolean {
  // Conservative default: only 5xx are retryable.
  return status >= 500;
}
