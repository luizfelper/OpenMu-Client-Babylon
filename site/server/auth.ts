// The site admin uses the same login and bcrypt hash as the OpenMU admin panel, but its own
// signed session cookie: Caddy's basic_auth cannot protect a page that has to render a login form.
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  ADMIN_HASH,
  ADMIN_USER,
  SESSION_MS,
  SESSION_SECRET,
  SITE_BASE_URL,
} from './config';
import { HttpError } from './http';

const COOKIE = 'mucura_admin';
const MAX_ATTEMPTS = 6;
const WINDOW_MS = 15 * 60 * 1000;

type Session = { user: string; exp: number };

const attempts = new Map<string, { count: number; reset: number }>();

function b64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function sessionConfigured(): boolean {
  return Boolean(SESSION_SECRET && ADMIN_HASH);
}

export function createSession(user: string): string {
  const payload = b64(JSON.stringify({ user, exp: Date.now() + SESSION_MS } satisfies Session));
  return `${payload}.${sign(payload)}`;
}

export function readSession(request: Request): Session | null {
  if (!SESSION_SECRET) return null;
  const header = request.headers.get('cookie');
  if (!header) return null;
  const token = header
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(sign(payload), signature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    if (typeof parsed.user !== 'string' || typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) {
      return null;
    }
    if (parsed.user !== ADMIN_USER) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function requireAdmin(request: Request): Session {
  const session = readSession(request);
  if (!session) throw new HttpError(401, 'Faça login para continuar.');
  return session;
}

export function sessionCookie(token: string): string {
  const secure = SITE_BASE_URL.startsWith('https://') ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = SITE_BASE_URL.startsWith('https://') ? '; Secure' : '';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.reset <= now) {
    attempts.set(ip, { count: 1, reset: now + WINDOW_MS });
    if (attempts.size > 10_000) {
      for (const [key, value] of attempts) {
        if (value.reset <= now) attempts.delete(key);
      }
    }
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function login(username: unknown, password: unknown, ip: string): Promise<string> {
  if (!sessionConfigured()) {
    throw new HttpError(503, 'O login do painel ainda não foi configurado pelo instalador.');
  }
  if (rateLimited(ip)) {
    throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
  }
  const user = typeof username === 'string' ? username.trim() : '';
  const pass = typeof password === 'string' ? password : '';
  if (!user || !pass || user !== ADMIN_USER) {
    throw new HttpError(401, 'Usuário ou senha inválidos.');
  }
  let valid = false;
  try {
    valid = await Bun.password.verify(pass, ADMIN_HASH);
  } catch {
    valid = false;
  }
  if (!valid) throw new HttpError(401, 'Usuário ou senha inválidos.');
  attempts.delete(ip);
  return createSession(ADMIN_USER);
}

export function resetLoginAttempts(): void {
  attempts.clear();
}
