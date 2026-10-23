// The proxy's presence endpoint is the only source of truth for who is online. It is loopback
// only, so the site asks it over the Compose network and caches the answer for a few seconds.
import { PRESENCE_URL } from './config';

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
