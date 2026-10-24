// The proxy's presence endpoint is the only source of truth for who is online. It is loopback
// only, so the site asks it over the Compose network and caches the answer for a few seconds.
import { PLAYER_CONTROL_SECRET, PRESENCE_URL } from './config';

const CONTROL_HEADER = 'x-mucura-control';

type Presence = {
  startedAt?: number;
  now?: number;
  /** `/presence` answers with the account names currently online. */
  online?: string[] | number;
  openConnections?: number;
  unidentifiedConnections?: number;
};

let cached: { at: number; online: number; available: boolean } = {
  at: 0,
  online: 0,
  available: false,
};

export async function onlinePlayers(): Promise<{ online: number; available: boolean }> {
  if (Date.now() - cached.at < 10_000) return { online: cached.online, available: cached.available };
  try {
    const response = await fetch(`${PRESENCE_URL}/presence`, {
      signal: AbortSignal.timeout(2500),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`presence ${response.status}`);
    const body = (await response.json()) as Presence;
    const online = Array.isArray(body.online)
      ? body.online.length
      : Math.max(0, Number(body.online) || 0);
    cached = { at: Date.now(), online, available: true };
  } catch (error) {
    console.warn(`presence unavailable: ${(error as Error).message}`);
    cached = { at: Date.now(), online: 0, available: false };
  }
  return { online: cached.online, available: cached.available };
}

/** The account behind a client session nonce, as the proxy sees it. */
export async function accountForSession(nonce: string): Promise<string | null> {
  if (!/^[0-9a-f]{32}$/.test(nonce)) return null;
  try {
    const response = await fetch(`${PRESENCE_URL}/ticket/${nonce}`, {
      signal: AbortSignal.timeout(2500),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { account?: string };
    return body.account || null;
  } catch {
    return null;
  }
}

export type PlayerGameState = {
  /** False when the proxy could not answer; the panel then disables map changes. */
  available: boolean;
  online: boolean;
  inWorld: boolean;
  character: string | null;
  map: number | null;
  x: number;
  y: number;
  level: number;
  money: number;
};

const OFFLINE_GAME_STATE: PlayerGameState = {
  available: false,
  online: false,
  inWorld: false,
  character: null,
  map: null,
  x: 0,
  y: 0,
  level: 0,
  money: 0,
};

function controlHeaders(): HeadersInit {
  return {
    accept: 'application/json',
    ...(PLAYER_CONTROL_SECRET ? { [CONTROL_HEADER]: PLAYER_CONTROL_SECRET } : {}),
  };
}

function gameState(value: unknown): PlayerGameState {
  const body = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const number = (key: string) => {
    const parsed = Number(body[key]);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    available: true,
    online: Boolean(body.online),
    inWorld: Boolean(body.inWorld),
    character: typeof body.character === 'string' ? body.character : null,
    map: Number.isInteger(body.map) ? Number(body.map) : null,
    x: number('x'),
    y: number('y'),
    level: number('level'),
    money: number('money'),
  };
}

/** The live character behind an account, straight from the proxy's tracker. */
export async function playerGameState(account: string): Promise<PlayerGameState> {
  try {
    const response = await fetch(`${PRESENCE_URL}/player/${encodeURIComponent(account)}`, {
      signal: AbortSignal.timeout(2500),
      headers: controlHeaders(),
    });
    if (!response.ok) throw new Error(`player ${response.status}`);
    return gameState(await response.json());
  } catch (error) {
    console.warn(`player status unavailable: ${(error as Error).message}`);
    return { ...OFFLINE_GAME_STATE };
  }
}

/**
 * Asks the proxy to inject a warp request into the player's live game socket.
 * The game server still validates the level, zen and map restrictions.
 */
export async function warpPlayer(
  account: string,
  serverIndex: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const query = new URLSearchParams({ account, index: String(serverIndex) });
    const response = await fetch(`${PRESENCE_URL}/warp?${query}`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
      headers: { ...controlHeaders(), 'content-type': 'application/json' },
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !body?.ok) {
      return { ok: false, error: body?.error || `warp ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
