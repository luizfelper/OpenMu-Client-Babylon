// The public site's configuration, all from the environment the installer renders.
import os from 'node:os';
import path from 'node:path';

const trimSlash = (value: string) => value.replace(/\/+$/, '');

export const PORT = Number(process.env.PORT || 3400);
export const HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

/** The site's own SQLite database. Never OpenMU's Postgres schema. */
export const DB_PATH =
  process.env.SITE_DB || path.join(os.homedir(), '.mu-site', 'site.sqlite');

/** OpenMU's Postgres, read-only from here: accounts, characters and rankings. */
export const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://postgres:admin@127.0.0.1:5432/openmu';

/** The proxy's internal presence server. Loopback only; never exposed by Caddy. */
export const PRESENCE_URL = trimSlash(
  process.env.PRESENCE_URL || 'http://127.0.0.1:3001'
);

/** The public origin players use, e.g. https://site.example.com. */
export const SITE_BASE_URL = trimSlash(
  process.env.SITE_BASE_URL || `http://localhost:${PORT}`
);

export const ADMIN_USER = process.env.SITE_ADMIN_USER || 'admin';
export const ADMIN_HASH = process.env.SITE_ADMIN_HASH || '';
export const SESSION_SECRET = process.env.SITE_SESSION_SECRET || '';

/** The client origin, allowed to read the public VIP status endpoint. */
export const CORS_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

/** Set to `off` only for a preview without OpenMU; production must validate accounts. */
export const ACCOUNT_CHECK = process.env.SITE_ACCOUNT_CHECK !== 'off';

export const SERVER_NAME = process.env.SERVER_NAME || 'MUCURA';
export const SERVER_DESCRIPTION =
  process.env.SERVER_DESCRIPTION || 'Season 6 Episode 3, played in the browser';
export const SERVER_VERSION = process.env.SERVER_VERSION || '0.9.10';
export const SERVER_LANGUAGE = process.env.SERVER_LANGUAGE || 'pt';

/** Where the client and the register page live, so default links can point at them. */
export const CLIENT_URL = process.env.CLIENT_URL || '';
export const REGISTER_URL = process.env.REGISTER_URL || '';

/** How long a signed admin session lives. */
export const SESSION_MS = 8 * 60 * 60 * 1000;
