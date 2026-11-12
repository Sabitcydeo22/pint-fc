// withApi: the wrapper EVERY route uses (docs/design/rules.md §4). It gives each request:
//   - a request id (response header `x-request-id`, and in every error body)
//   - one error format: AppError and database errors (PF401..PF422) map to the closed code list; anything
//     else becomes a generic INTERNAL with no details
//   - `Cache-Control: no-store` and a JSON content type
//   - for state-changing methods: the cross-site check (Origin / Sec-Fetch-Site) and "JSON only"
//   - an 8 KB limit and strict validation for request bodies (ctx.readJson)
//   - one log line per request: method, path, status, time. Never bodies, cookies, query strings or headers.
//
// Usage:
//   export const POST = withApi(async ({ request, readJson }) => {
//     const input = await readJson(mySchema);
//     return json({ ok: true });
//   });
import type { z } from 'zod';
import { AppError, mapDbError, newRequestId, toErrorResponse } from './errors';
import { log } from './log';
import { parseOrThrow } from './schemas';

export const MAX_BODY_BYTES = 8192;
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const JSON_TYPE = /^application\/json\s*(;.*)?$/i;

export interface ApiCtx {
  request: Request;
  requestId: string;
  /** Reads the body (max 8 KB), parses JSON, validates with a STRICT schema; throws VALIDATION (400) on any problem. */
  readJson<S extends z.ZodType>(schema: S): Promise<z.output<S>>;
}
export type ApiHandler = (ctx: ApiCtx, routeCtx?: unknown) => Promise<Response>;

/** A JSON response. */
export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

/** 204 with optional extra `Set-Cookie` headers. */
export function noContent(setCookies: string[] = []): Response {
  const headers = new Headers({ 'cache-control': 'no-store' });
  for (const c of setCookies) headers.append('set-cookie', c);
  return new Response(null, { status: 204, headers });
}

/** Refuses state-changing requests that come from another site, or that are not declared as JSON. */
function assertSafeRequest(request: Request): void {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (origin !== null) {
    if (origin !== new URL(request.url).origin) throw new AppError('FORBIDDEN', 'Cross-site requests are not allowed.');
  } else if (site !== null && site !== 'same-origin' && site !== 'none') {
    throw new AppError('FORBIDDEN', 'Cross-site requests are not allowed.');
  }
  const contentType = request.headers.get('content-type');
  if ((request.body !== null || contentType !== null) && !(contentType !== null && JSON_TYPE.test(contentType))) {
    throw new AppError('VALIDATION', 'Content-Type must be application/json.');
  }
}

async function readBodyText(request: Request): Promise<string> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new AppError('VALIDATION', 'Request body is too large.');
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new AppError('VALIDATION', 'Request body is too large.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S>> {
  const text = await readBodyText(request);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AppError('VALIDATION', 'Request body must be valid JSON.');
  }
  return parseOrThrow(schema, data);
}

function isDbError(e: unknown): boolean {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && /^PF\d{3}$/.test(code);
}

export function withApi(handler: ApiHandler): (request: Request, routeCtx?: unknown) => Promise<Response> {
  return async (request, routeCtx) => {
    const requestId = newRequestId();
    const started = performance.now();
    let response: Response;
    try {
      if (STATE_CHANGING.has(request.method)) assertSafeRequest(request);
      response = await handler({ request, requestId, readJson: (schema) => readJson(request, schema) }, routeCtx);
    } catch (e) {
      response = toErrorResponse(isDbError(e) ? mapDbError(e) : e, requestId);
    }
    response.headers.set('x-request-id', requestId);
    if (!response.headers.has('cache-control')) response.headers.set('cache-control', 'no-store');
    log.info('request', {
      request_id: requestId,
      method: request.method,
      path: new URL(request.url).pathname,
      status: response.status,
      ms: Math.round(performance.now() - started),
    });
    return response;
  };
}
