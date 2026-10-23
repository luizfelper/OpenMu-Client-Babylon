// Names, ports and addresses shared by the renderers and install/stack/compose.yml. Change both together.
export const PROJECT = 'mu';
export const WEB_IP = '172.30.77.10';

export const PORTS = {
  proxy: 3000,
  presence: 3001,
  register: 3100,
  cashshop: 3200,
  marketplace: 3300,
  site: 3400,
  admin: 8080,
  connect: 44405,
  /** OpenMU 0.9.x seeds its game servers here; the newer versions seed `newerFirstGame`. */
  firstGame: 55901,
  newerFirstGame: 45901,
  gameServers: 6,
  /** IP mode only: the public site and the register site on their own ports. */
  registerSite: 8081,
  siteSite: 8082,
  /** The webmail behind Caddy, and the mail server's public ports (the `mail` profile only). */
  webmail: 80,
  smtp: 25,
  submissions: 465,
  submission: 587,
  imaps: 993,
} as const;

/** Service names on the Compose network; the proxy shares OpenMU's namespace, so both answer on `openmu-startup`. */
export const HOSTS = {
  openmu: 'openmu-startup',
  database: 'database',
  register: 'register',
  cashshop: 'cashshop',
  marketplace: 'marketplace',
  site: 'site',
  webmail: 'webmail',
} as const;

export type Service =
  | 'database'
  | 'openmu'
  | 'proxy'
  | 'register'
  | 'cashshop'
  | 'marketplace'
  | 'site'
  | 'ops'
  | 'web'
  | 'mailserver'
  | 'webmail';

/** The Compose profile the mail server and webmail run under. */
export const MAIL_PROFILE = 'mail';

/** Every service's data lives under one volume mounted at /data. */
export const DATA = {
  track: '/data/proxy/track.sqlite',
  register: '/data/register/signups.sqlite',
  cashshop: '/data/cashshop/shop.sqlite',
  marketplace: '/data/marketplace/market.sqlite',
  site: '/data/site/site.sqlite',
  ops: '/data/ops/ops.sqlite',
  openmuLogs: '/openmu-logs',
} as const;

/**
 * Every port a game server may listen on.
 *
 * The port is OpenMU's own setting, seeded into its database: 0.9.x uses
 * 55901.., the current versions use 45901... An admin-panel update can rewrite
 * it, so the proxy allows both ranges and the status probes both, instead of
 * reporting a game server that answers as down.
 */
export function gamePorts(): number[] {
  return [PORTS.firstGame, PORTS.newerFirstGame].flatMap(first =>
    Array.from({ length: PORTS.gameServers }, (_, i) => first + i)
  );
}
