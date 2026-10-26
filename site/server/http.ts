// Small HTTP helpers shared by every route.
import { CORS_ORIGINS, SITE_BASE_URL } from './config';

export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      ...extra,
    },
  });
}

export function text(body: string, status = 200, type = 'text/plain; charset=utf-8'): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': type,
      'x-content-type-options': 'nosniff',
    },
  });
}

export function corsHeaders(request: Request, credentials = false): HeadersInit {
  const origin = request.headers.get('origin') || '';
  const allowed = CORS_ORIGINS.includes(origin) || origin === SITE_BASE_URL;
  if (!allowed) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    ...(credentials ? { 'access-control-allow-credentials': 'true' } : {}),
    vary: 'origin',
  };
}

/**
 * A cross-origin call is accepted only from a host the installer trusts (the client's origin), and
 * must carry its session as a bearer token: the cookie is never read from another origin.
 */
export function isTrustedCrossOrigin(request: Request): boolean {
  const origin = request.headers.get('origin') || '';
  return Boolean(origin) && CORS_ORIGINS.includes(origin) && origin !== SITE_BASE_URL;
}

export async function readJson<T>(request: Request, maxBytes = 1_000_000): Promise<T> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new HttpError(413, 'Request body too large.');
  const body = await request.text();
  if (body.length > maxBytes) throw new HttpError(413, 'Request body too large.');
  if (!body.trim()) throw new HttpError(400, 'A JSON body is required.');
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

/** Admin calls must come from this site (or an explicitly allowed origin). */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin) return; // curl, the installer's checks, and same-origin GETs without an Origin header
  if (origin === SITE_BASE_URL) return;
  throw new HttpError(403, 'Origin not allowed.');
}

export function requireMethod(request: Request, ...methods: string[]): void {
  if (!methods.includes(request.method)) {
    throw new HttpError(405, 'Method not allowed.');
  }
}

export function stringField(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be text.`);
  const out = value.trim();
  if (!out) throw new HttpError(400, `${name} is required.`);
  if (out.length > max) throw new HttpError(400, `${name} is too long.`);
  return out;
}

export function optionalString(value: unknown, name: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be text.`);
  const out = value.trim();
  if (out.length > max) throw new HttpError(400, `${name} is too long.`);
  return out;
}

export function booleanField(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'on' || value === 'true' || value === 1 || value === '1') return true;
  if (value === 'off' || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

export function numberField(value: unknown, name: string, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, `${name} must be between ${min} and ${max}.`);
  }
  return n;
}

/** A URL the site will render or redirect to. */
export function safeHttpUrl(value: unknown, name: string, allowEmpty = true): string {
  const raw = optionalString(value, name, 500);
  if (!raw && allowEmpty) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
    return url.toString();
  } catch {
    throw new HttpError(400, `${name} must be an http(s) URL.`);
  }
}
