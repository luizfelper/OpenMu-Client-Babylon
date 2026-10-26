// Player login for the public site. Credentials are the game account's own: the password is
// checked against OpenMU's BCrypt hash and never stored. The site session only remembers the
// account name, so VIP checkout can be tied to the account that is actually logged in.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SESSION_SECRET, SITE_BASE_URL } from './config';
import { HttpError } from './http';
import { createOpenMuAccount, verifyAccountPassword } from './openmu';
import { profileFor, saveProfile, type PlayerProfile } from './players';
import { BurstLimit, bucketFor } from '../../src/core/rateLimit';
import { isReservedName } from '../../src/modules/servers/reservedNames';

const COOKIE = 'mucura_player';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[A-Za-z0-9]{4,10}$/;
const PASSWORD_RE = /^[!-~]{4,10}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const loginAttempts = new BurstLimit(10, 10 * 60 * 1000);
const registerAttempts = new BurstLimit(5, 60 * 60 * 1000);

type PlayerSession = { account: string; exp: number };

function b64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', SESSION_SECRET).update(`player:${payload}`).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function field(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new HttpError(400, `${label}: valor inválido.`);
  const text = value.trim();
  if (!text) throw new HttpError(400, `${label}: preencha este campo.`);
  if (text.length > max) throw new HttpError(400, `${label}: use no máximo ${max} caracteres.`);
  return text;
}

function secretField(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) {
    throw new HttpError(400, `${label}: preencha este campo.`);
  }
  if (value.length > 100) throw new HttpError(400, `${label}: valor inválido.`);
  return value;
}

function validateSignup(value: unknown): {
  account: string;
  name: string;
  email: string;
  password: string;
} {
  if (!value || typeof value !== 'object') throw new HttpError(400, 'Dados inválidos.');
  const raw = value as Record<string, unknown>;

  const account = field(raw.account, 'Conta do jogo', 10);
  if (!USERNAME_RE.test(account)) {
    throw new HttpError(400, 'A conta deve ter de 4 a 10 letras ou números, sem espaços.');
  }
  if (isReservedName(account)) throw new HttpError(400, 'Esse nome de conta é reservado.');

  const name = field(raw.name, 'Nome completo', 80);
  if (name.length < 3) throw new HttpError(400, 'Informe seu nome completo.');

  const email = field(raw.email, 'E-mail', 160).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Informe um e-mail válido.');

  const password = secretField(raw.password, 'Senha');
  if (!PASSWORD_RE.test(password)) {
    throw new HttpError(400, 'A senha deve ter de 4 a 10 caracteres, sem espaços ou acentos.');
  }
  const confirm = secretField(raw.confirm, 'Confirmação de senha');
  if (password !== confirm) throw new HttpError(400, 'As senhas não coincidem.');

  return { account, name, email, password };
}

function tokenFor(account: string): string {
  if (!SESSION_SECRET) {
    throw new HttpError(503, 'O login do site ainda não foi configurado pelo instalador.');
  }
  const payload = b64(JSON.stringify({ account, exp: Date.now() + SESSION_MS } satisfies PlayerSession));
  return `${payload}.${sign(payload)}`;
}

export function readPlayerSession(request: Request): PlayerSession | null {
  if (!SESSION_SECRET) return null;
  const header = request.headers.get('cookie');
  if (!header) return null;
  const token = header
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  return readPlayerToken(token);
}

/** A site player session token, as carried by the cookie or by the panel page's own origin. */
export function readPlayerToken(token: string | null | undefined): PlayerSession | null {
  if (!SESSION_SECRET || !token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(sign(payload), signature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as PlayerSession;
    if (
      typeof parsed.account !== 'string' ||
      !parsed.account ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** The logged-in player's profile, or null when there is no valid site session. */
export function playerFromRequest(request: Request): PlayerProfile | null {
  const session = readPlayerSession(request);
  if (!session) return null;
  return profileFor(session.account) ?? { account: session.account, name: '', email: '' };
}

/** The player behind a bearer token (the dedicated panel page, which may live on its own host). */
export function playerFromBearer(token: string | null | undefined): PlayerProfile | null {
  const session = readPlayerToken(token);
  if (!session) return null;
  return profileFor(session.account) ?? { account: session.account, name: '', email: '' };
}

export function playerCookie(token: string): string {
  const secure = SITE_BASE_URL.startsWith('https://') ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure}`;
}

export function clearPlayerCookie(): string {
  const secure = SITE_BASE_URL.startsWith('https://') ? '; Secure' : '';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/** Same cookie, handed to the panel page's host when it is not this origin. */
export function playerCookieForOtherOrigin(token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=None${SITE_BASE_URL.startsWith('https://') ? '; Secure' : ''}; Max-Age=${Math.floor(SESSION_MS / 1000)}`;
}

export async function registerPlayer(
  value: unknown,
  ip: string
): Promise<{ player: PlayerProfile; token: string }> {
  if (!SESSION_SECRET) {
    throw new HttpError(503, 'O login do site ainda não foi configurado pelo instalador.');
  }
  const { account, name, email, password } = validateSignup(value);
  if (registerAttempts.hammering(bucketFor(ip))) {
    throw new HttpError(429, 'Muitas tentativas de cadastro. Aguarde alguns minutos.');
  }

  let rejection: string | null;
  try {
    rejection = await createOpenMuAccount(account, password, email);
  } catch (error) {
    console.error(`site registration failed: ${(error as Error).message}`);
    throw new HttpError(503, 'Não foi possível criar a conta agora. Tente novamente.');
  }
  if (rejection) {
    if (/already taken/i.test(rejection)) {
      throw new HttpError(409, 'Essa conta já existe. Escolha outro login.');
    }
    throw new HttpError(400, 'Não foi possível criar a conta. Confira os dados.');
  }

  const player = saveProfile(account, name, email);
  return { player, token: tokenFor(player.account) };
}

export async function loginPlayer(
  value: unknown,
  ip: string
): Promise<{ player: PlayerProfile; token: string }> {
  if (!SESSION_SECRET) {
    throw new HttpError(503, 'O login do site ainda não foi configurado pelo instalador.');
  }
  if (!value || typeof value !== 'object') throw new HttpError(400, 'Dados inválidos.');
  const raw = value as Record<string, unknown>;
  const account = field(raw.account, 'Conta do jogo', 10);
  const password = secretField(raw.password, 'Senha');

  if (loginAttempts.hammering(bucketFor(ip))) {
    throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
  }

  let verified: Awaited<ReturnType<typeof verifyAccountPassword>>;
  try {
    verified = await verifyAccountPassword(account, password);
  } catch (error) {
    console.error(`site login failed: ${(error as Error).message}`);
    throw new HttpError(503, 'Não foi possível validar o login agora. Tente novamente.');
  }
  if (!verified) throw new HttpError(401, 'Conta ou senha inválidos.');

  let player = profileFor(verified.account);
  if (!player) player = saveProfile(verified.account, '', verified.email);
  return { player, token: tokenFor(player.account) };
}
