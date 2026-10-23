// Is everything answering? Checked from inside the web (Caddy) container, over the same paths Caddy uses.
import type { Stack } from './docker';
import { mailOn } from './render/mail';
import { gamePorts, HOSTS, PORTS } from './stack';

export type Check = { name: string; ok: boolean };

/** Each entry lists the ports that count as "this service answered"; the game servers moved once already. */
const TCP: [string, string, number[]][] = [
  ['OpenMU connect server', HOSTS.openmu, [PORTS.connect]],
  ['OpenMU game server', HOSTS.openmu, gamePorts()],
  ['OpenMU admin panel', HOSTS.openmu, [PORTS.admin]],
  ['Proxy (websocket)', HOSTS.openmu, [PORTS.proxy]],
  ['Register', HOSTS.register, [PORTS.register]],
];

const HTTP: [string, string][] = [
  ['Cash shop', `http://${HOSTS.cashshop}:${PORTS.cashshop}/api/catalog`],
  ['Marketplace', `http://${HOSTS.marketplace}:${PORTS.marketplace}/api/market/listings`],
  ['Site', `http://${HOSTS.site}:${PORTS.site}/api/health`],
];

export async function checks(stack: Stack): Promise<Check[]> {
  // IMAPS answers once the mail server has its certificate (DNS for mail.<domain> must be in place).
  const tcp = mailOn(stack.config) ? [...TCP, ['Mail server (IMAPS)', 'mailserver', [PORTS.imaps]] as [string, string, number[]]] : TCP;
  const script = [
    ...tcp.map(([, host, ports]) => `( ${ports.map(p => `nc -z -w 3 ${host} ${p}`).join(' || ')} ) && echo 1 || echo 0`),
    // Any HTTP answer counts: the marketplace says 401 to a caller without a player session.
    ...HTTP.map(([, url]) => `wget -S -T 5 -O /dev/null ${url} 2>&1 | grep -q 'HTTP/' && echo 1 || echo 0`),
  ].join('; ');
  const r = await stack.exec('web', ['sh', '-c', script]);
  const results = r.out.split('\n');
  return [...tcp.map(t => t[0]), ...HTTP.map(h => h[0])].map((name, i) => ({ name, ok: results[i]?.trim() === '1' }));
}

/**
 * Waits until OpenMU has seeded (or migrated) its database and its connect server listens.
 *
 * Only meant right after OpenMU itself was (re)created: it keys off the startup log, and a
 * container that was left running still carries the line from its previous boot.
 */
export async function waitForOpenMu(stack: Stack, timeoutMs = 10 * 60_000, onLine?: (l: string) => void): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const logs = await stack.compose(['logs', '--no-color', '--tail', '400', 'openmu-startup']);
    const last = logs.out.split('\n').filter(Boolean).pop();
    if (last) onLine?.(last.replace(/^\S+\s+\|\s*/, ''));
    if (/Client Listener started, Port 44405/.test(logs.out)) return;
    await Bun.sleep(3000);
  }
  throw new Error('OpenMU did not start in time; see `mu logs openmu-startup`.');
}

/**
 * Polls `checks` until every service answers, or `timeoutMs` runs out; returns the last round.
 *
 * A restart's `--wait` only means the healthchecks passed: OpenMU is still seeding and the
 * proxy / cash shop / marketplace reach it through its network namespace, so a single check
 * right after `up` races the stack and reports a service that is merely still coming up. The
 * install does this after its own `up`; `update` and `configure` must too.
 */
export async function waitForHealthy(stack: Stack, timeoutMs = 120_000): Promise<Check[]> {
  const until = Date.now() + timeoutMs;
  let results = await checks(stack);
  while (!results.every(r => r.ok) && Date.now() < until) {
    await Bun.sleep(3000);
    results = await checks(stack);
  }
  return results;
}
