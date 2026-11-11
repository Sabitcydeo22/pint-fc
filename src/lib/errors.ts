// One error format for every API failure (docs/design/api.md):
//   { "error": { "code": "RSVP_CLOSED", "message": "...", "request_id": "..." } }
import { log } from './log';

export type ErrorCode =
  | 'VALIDATION'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RSVP_CLOSED'
  | 'MATCH_NOT_OPEN'
  | 'MINOR_NEEDS_GUARDIAN'
  | 'INTERNAL';

export const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RSVP_CLOSED: 409,
  MATCH_NOT_OPEN: 409,
  MINOR_NEEDS_GUARDIAN: 422,
  INTERNAL: 500,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION: 'The request is not valid.',
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  UNAUTHENTICATED: 'Sign in to continue.',
  FORBIDDEN: 'You are not allowed to do that.',
  NOT_FOUND: 'Not found.',
  RSVP_CLOSED: 'RSVP is closed for this match.',
  MATCH_NOT_OPEN: 'This match is not open for RSVP.',
  MINOR_NEEDS_GUARDIAN: 'Guardian consent is needed before this profile can be public.',
  INTERNAL: 'Something went wrong.',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  constructor(code: ErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_STATUS[code];
  }
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; request_id: string };
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

/** The only way a route returns a failure. Unknown errors become a generic INTERNAL; details go to the log. */
export function toErrorResponse(err: unknown, requestId: string): Response {
  let appError: AppError;
  if (err instanceof AppError) {
    appError = err;
  } else {
    const dbCode = (err as { code?: unknown } | null | undefined)?.code;
    log.error('unhandled_error', {
      request_id: requestId,
      error_name: err instanceof Error ? err.name : typeof err,
      db_code: typeof dbCode === 'string' && dbCode.length === 5 ? dbCode : undefined,
    });
    appError = new AppError('INTERNAL');
  }
  const body: ErrorBody = {
    error: { code: appError.code, message: appError.message, request_id: requestId },
  };
  return new Response(JSON.stringify(body), {
    status: appError.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
  });
}

const DB_CODES: Record<string, ErrorCode> = {
  PF401: 'UNAUTHENTICATED',
  PF404: 'NOT_FOUND',
  PF409: 'RSVP_CLOSED',
  PF410: 'MATCH_NOT_OPEN',
  PF422: 'MINOR_NEEDS_GUARDIAN',
};

/** Maps the database's custom SQLSTATEs (PF401..PF422) to an AppError; anything else is INTERNAL. */
export function mapDbError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const code = (err as { code?: unknown } | null | undefined)?.code;
  const mapped = typeof code === 'string' ? DB_CODES[code] : undefined;
  return new AppError(mapped ?? 'INTERNAL');
}
