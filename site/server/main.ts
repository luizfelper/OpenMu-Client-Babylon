// The MUCURA public site: news, server information, rankings, online count, VIP checkout and the
// admin API. One Bun process, one SQLite file, read-only OpenMU Postgres.
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_USER,
  HOSTNAME,
  PORT,
  SITE_BASE_URL,
} from './config';
import { clearSessionCookie, login, readSession, requireAdmin, sessionCookie, sessionConfigured } from './auth';
import { db, setSetting } from './db';
import { clientIp } from '../../src/core/rateLimit';
import {
  HttpError,
  assertSameOrigin,
  corsHeaders,
  json,
  readJson,
} from './http';
import {
  adminNews,
  createNews,
  deleteNews,
  getNewsBySlug,
  listNews,
  newsCount,
  seedNews,
  updateNews,
} from './news';
import { getRankings, rankingSnapshotCount } from './rankings';
import { onlinePlayers } from './presence';
import {
  adminSettings,
  ensureDefaults,
  getMpSettings,
  getPlans,
  publicSite,
  saveAdminSettings,
} from './settings';
import { verifyWebhookSignature } from './mpSignature';
import { testConnection } from './mercadopago';
import {
  createCheckout,
  createPixCheckout,
  getOrder,
  listOrders,
  manualApprove,
  orderStats,
  processPayment,
  vipStatusForSession,
} from './vip';

const WEB_ROOT = fileURLToPath(new URL('../web', import.meta.url));
// Bumped on every process start so browsers and Cloudflare fetch fresh JS/CSS after a deploy.
const ASSET_VERSION = Date.now().toString(36);

const HTML_HEADERS: HeadersInit = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-cache',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy':
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://www.mercadopago.com.br https://www.mercadopago.com",
};

ensureDefaults();
seedNews();

const checkoutAttempts = new Map<string, number[]>();

function checkoutAllowed(ip: string): boolean {
  const now = Date.now();
  const recent = (checkoutAttempts.get(ip) ?? []).filter(at => now - at < 60_000);
  if (recent.length >= 10) {
    checkoutAttempts.set(ip, recent);
    return false;
  }
  recent.push(now);
  checkoutAttempts.set(ip, recent);
  if (checkoutAttempts.size > 10_000) {
    for (const [key, times] of checkoutAttempts) {
      if (!times.some(at => now - at < 60_000)) checkoutAttempts.delete(key);
    }
  }
  return true;
}

function intParam(url: URL, name: string, fallback: number, min: number, max: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, `${name} inválido.`);
  }
  return value;
}

async function sitePayload(): Promise<Record<string, unknown>> {
  const [rankings, online] = await Promise.all([getRankings(), onlinePlayers()]);
  return {
    ...publicSite(),
    news: listNews({ publishedOnly: true, limit: 6 }),
    rankings,
    online,
    generatedAt: Date.now(),
  };
}

function adminStats(): Record<string, unknown> {
  return {
    news: { total: newsCount(), published: newsCount(true) },
    rankings: { snapshots: rankingSnapshotCount() },
    orders: orderStats(),
    admin_configured: sessionConfigured(),
  };
}

async function staticFile(pathname: string): Promise<Response | null> {
  let rel: string;
  if (pathname === '/' || pathname === '/index.html') rel = 'index.html';
  else if (pathname === '/admin' || pathname === '/admin/') rel = 'admin.html';
  else if (
    pathname === '/app.js' ||
    pathname === '/admin.js' ||
    pathname === '/styles.css' ||
    pathname === '/admin.css'
  ) {
    rel = pathname.slice(1);
  } else if (pathname.startsWith('/assets/')) {
    rel = pathname.slice(1);
  } else if (pathname === '/robots.txt') {
    rel = 'robots.txt';
  } else if (
    pathname === '/vip' ||
    pathname === '/vip/retorno' ||
    pathname === '/ranking' ||
    pathname === '/regras' ||
    pathname === '/faq' ||
    pathname === '/noticias' ||
    pathname.startsWith('/noticias/') ||
    pathname === '/termos' ||
    pathname === '/privacidade'
  ) {
    rel = 'index.html';
  } else {
    return null;
  }

  const filePath = resolve(WEB_ROOT, rel);
  if (filePath !== WEB_ROOT && !filePath.startsWith(WEB_ROOT + sep)) return null;
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  const isHtml = filePath.endsWith('.html');
  const type = filePath.endsWith('.js')
    ? 'text/javascript; charset=utf-8'
    : filePath.endsWith('.css')
      ? 'text/css; charset=utf-8'
      : filePath.endsWith('.webp')
        ? 'image/webp'
        : filePath.endsWith('.txt')
          ? 'text/plain; charset=utf-8'
          : undefined;
  if (isHtml) {
    const html = (await file.text()).replaceAll('__ASSET_VERSION__', ASSET_VERSION);
    return new Response(html, { headers: HTML_HEADERS });
  }
  return new Response(file, {
    headers: {
      ...(type ? { 'content-type': type } : {}),
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function webhook(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  const raw = await request.text();
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  const type = url.searchParams.get('type') || (typeof body.type === 'string' ? body.type : '');
  const data = body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : {};
  const dataId = url.searchParams.get('data.id') || (data.id !== undefined ? String(data.id) : '');
  if (type && type !== 'payment') return json({ ok: true, ignored: type });
  if (!dataId) return json({ ok: true, ignored: 'no payment id' });

  const settings = getMpSettings();
  if (settings.webhookSecret) {
    const valid = verifyWebhookSignature(
      request.headers.get('x-signature'),
      request.headers.get('x-request-id'),
      dataId,
      settings.webhookSecret
    );
    if (!valid) {
      console.warn('mercadopago webhook: invalid signature');
      return json({ error: 'Invalid signature.' }, 401);
    }
  }

  try {
    const result = await processPayment(dataId);
    return json({ ok: true, ...result });
  } catch (error) {
    console.error(`mercadopago webhook failed: ${(error as Error).message}`);
    return json({ error: 'Payment lookup failed.' }, 502);
  }
}

async function handle(request: Request, ip: string): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const cors = corsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (path === '/api/health') {
    return json({
      ok: true,
      service: 'mucura-site',
      admin: sessionConfigured(),
      mercadopago: getMpSettings().enabled && Boolean(getMpSettings().accessToken),
    });
  }

  if (path === '/api/site' && request.method === 'GET') {
    return json(await sitePayload(), 200, cors);
  }

  if (path === '/api/online' && request.method === 'GET') {
    return json(await onlinePlayers(), 200, cors);
  }

  if (path === '/api/rankings' && request.method === 'GET') {
    return json(await getRankings(), 200, cors);
  }

  if (path === '/api/news' && request.method === 'GET') {
    return json(
      {
        news: listNews({
          publishedOnly: true,
          limit: intParam(url, 'limit', 12, 1, 50),
          offset: intParam(url, 'offset', 0, 0, 10_000),
        }),
      },
      200,
      cors
    );
  }

  const newsSlug = path.match(/^\/api\/news\/([^/]+)$/);
  if (newsSlug && request.method === 'GET') {
    const article = getNewsBySlug(decodeURIComponent(newsSlug[1]));
    if (!article) return json({ error: 'Notícia não encontrada.' }, 404, cors);
    return json(article, 200, cors);
  }

  if (path === '/api/vip/plans' && request.method === 'GET') {
    return json({ plans: getPlans(), payments: publicSite().payments }, 200, cors);
  }

  if (path === '/api/vip/checkout' && request.method === 'POST') {
    if (!checkoutAllowed(ip)) {
      throw new HttpError(429, 'Muitas tentativas de compra. Aguarde um minuto.');
    }
    const body = await readJson<unknown>(request);
    const result = await createCheckout(body);
    return json(result, 201, cors);
  }

  if (path === '/api/vip/checkout/pix' && request.method === 'POST') {
    if (!checkoutAllowed(ip)) {
      throw new HttpError(429, 'Muitas tentativas de compra. Aguarde um minuto.');
    }
    const body = await readJson<unknown>(request);
    const result = await createPixCheckout(body);
    return json(result, 201, cors);
  }

  const orderPath = path.match(/^\/api\/vip\/order\/([0-9a-f-]{36})$/);
  if (orderPath && request.method === 'GET') {
    const order = getOrder(orderPath[1]);
    if (!order) return json({ error: 'Pedido não encontrado.' }, 404, cors);
    return json(order, 200, cors);
  }

  if (path === '/api/vip/me' && request.method === 'GET') {
    const nonce = url.searchParams.get('session') || '';
    const status = await vipStatusForSession(nonce);
    return json(status, 200, cors);
  }

  if (path === '/api/vip/webhook' && request.method === 'POST') {
    return webhook(request);
  }

  if (path === '/api/admin/login' && request.method === 'POST') {
    assertSameOrigin(request);
    const body = await readJson<{ username?: unknown; password?: unknown }>(request);
    const token = await login(body.username, body.password, ip);
    return json({ ok: true, user: ADMIN_USER }, 200, {
      ...cors,
      'set-cookie': sessionCookie(token),
    });
  }

  if (path === '/api/admin/logout' && request.method === 'POST') {
    assertSameOrigin(request);
    return json({ ok: true }, 200, { ...cors, 'set-cookie': clearSessionCookie() });
  }

  if (path === '/api/admin/me' && request.method === 'GET') {
    const session = readSession(request);
    if (!session) return json({ error: 'Não autenticado.' }, 401, cors);
    return json({ user: session.user, expires: session.exp }, 200, cors);
  }

  if (path.startsWith('/api/admin/')) {
    requireAdmin(request);
    if (request.method !== 'GET') assertSameOrigin(request);
  }

  if (path === '/api/admin/stats' && request.method === 'GET') {
    return json(adminStats(), 200, cors);
  }

  if (path === '/api/admin/settings' && request.method === 'GET') {
    return json({ settings: adminSettings() }, 200, cors);
  }

  if (path === '/api/admin/settings' && request.method === 'PUT') {
    const body = await readJson<unknown>(request);
    return json({ settings: saveAdminSettings(body) }, 200, cors);
  }

  if (path === '/api/admin/news' && request.method === 'GET') {
    return json({ news: adminNews() }, 200, cors);
  }

  if (path === '/api/admin/news' && request.method === 'POST') {
    const body = await readJson<unknown>(request);
    return json({ news: createNews(body) }, 201, cors);
  }

  const adminNewsId = path.match(/^\/api\/admin\/news\/(\d+)$/);
  if (adminNewsId && request.method === 'PUT') {
    const body = await readJson<unknown>(request);
    return json({ news: updateNews(Number(adminNewsId[1]), body) }, 200, cors);
  }

  if (adminNewsId && request.method === 'DELETE') {
    deleteNews(Number(adminNewsId[1]));
    return json({ ok: true }, 200, cors);
  }

  if (path === '/api/admin/orders' && request.method === 'GET') {
    const status = url.searchParams.get('status') || undefined;
    return json({ orders: listOrders(intParam(url, 'limit', 100, 1, 500), status) }, 200, cors);
  }

  const approvePath = path.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})\/approve$/);
  if (approvePath && request.method === 'POST') {
    return json({ order: manualApprove(approvePath[1]) }, 200, cors);
  }

  if (path === '/api/admin/mercadopago/test' && request.method === 'POST') {
    const body = await readJson<Record<string, unknown>>(request).catch(
      () => ({}) as Record<string, unknown>
    );
    if (typeof body.access_token === 'string' && body.access_token.trim()) {
      setSetting('mp_access_token', body.access_token.trim());
    }
    return json(await testConnection(), 200, cors);
  }

  if (path.startsWith('/api/')) {
    return json({ error: 'Not found.' }, 404, cors);
  }

  const file = await staticFile(path);
  if (file) return file;

  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

const server = Bun.serve({
  port: PORT,
  hostname: HOSTNAME,
  async fetch(request, bunServer) {
    const ip = clientIp(request, bunServer);
    try {
      return await handle(request, ip);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message, details: error.details }, error.status, corsHeaders(request));
      }
      console.error(error);
      return json({ error: 'Erro interno do servidor.' }, 500, corsHeaders(request));
    }
  },
  error(error) {
    console.error(error);
    return json({ error: 'Erro interno do servidor.' }, 500);
  },
});

console.info(`MUCURA site on ${SITE_BASE_URL} (port ${server.port})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.stop();
    db.close();
    process.exit(0);
  });
}

