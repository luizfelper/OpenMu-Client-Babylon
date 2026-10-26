// painel.<domain>: the player's panel on its own host. It serves the page and proxies only the few
// endpoints the page needs to the site's /api, so the site's cookie never has to cross origins.
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT, SITE_BASE_URL } from './config';
import { HttpError, json } from './http';

const WEB_ROOT = fileURLToPath(new URL('../web', import.meta.url));
const PREFIX = '/site-api';
// Bumped on every process start, like the site's, so a deploy is picked up at once.
const ASSET_VERSION = Date.now().toString(36);

const SITE_ASSETS = ['/styles.css', '/painel.js', '/assets/mucura.webp'];

/** Only what the panel page itself calls; /api/admin, checkout and accounts are never relayed. */
const RELAY = [/^\/api\/site$/, /^\/api\/auth\/(me|login|logout)$/, /^\/api\/player\/(page|warp)$/];

const HEADERS: HeadersInit = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-cache',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy':
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function typeOf(path: string): string | undefined {
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return undefined;
}

async function file(pathname: string): Promise<Response | null> {
  if (!pathname.startsWith('/assets/') && !SITE_ASSETS.includes(pathname)) return null;
  const filePath = resolve(WEB_ROOT, pathname.slice(1));
  if (!filePath.startsWith(WEB_ROOT + sep)) return null;
  const body = Bun.file(filePath);
  if (!(await body.exists())) return null;
  return new Response(body, {
    headers: { ...(typeOf(pathname) ? { 'content-type': typeOf(pathname) } : {}), 'cache-control': 'public, max-age=3600' },
  });
}

async function page(): Promise<Response> {
  const html = await Bun.file(resolve(WEB_ROOT, 'painel.html')).text();
  return new Response(html.replaceAll('__ASSET_VERSION__', ASSET_VERSION), { headers: HEADERS });
}

/** Relays to the site as same origin: the site then answers read-only panel calls on the token. */
async function relay(request: Request, path: string, search: string): Promise<Response> {
  if (!RELAY.some(rule => rule.test(path))) throw new HttpError(404, 'Not found.');
  const headers: Record<string, string> = { accept: 'application/json', origin: SITE_BASE_URL };
  for (const name of ['content-type', 'authorization', 'x-forwarded-for']) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
  const upstream = await fetch(`${SITE_BASE_URL}${path}${search}`, {
    method: request.method,
    headers,
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const out = new Headers({
    'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  const cookie = upstream.headers.get('set-cookie');
  if (cookie) out.set('set-cookie', cookie);
  return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: out });
}

const server = Bun.serve({
  port: Number(process.env.SITE_PANEL_PORT || PORT + 1),
  hostname: process.env.HOSTNAME || '0.0.0.0',
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === PREFIX) return Response.redirect(`${url.origin}${PREFIX}/`, 308);
      if (url.pathname.startsWith(`${PREFIX}/`)) {
        return await relay(request, url.pathname.slice(PREFIX.length), url.search);
      }
      if (url.pathname === '/' || url.pathname === '/painel' || url.pathname === '/painel/') return page();
      const asset = await file(url.pathname);
      if (asset) return asset;
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: 'Erro interno do servidor.' }, 500);
    }
  },
});

console.info(`MUCURA panel on port ${server.port} (site at ${SITE_BASE_URL})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.stop();
    process.exit(0);
  });
}
