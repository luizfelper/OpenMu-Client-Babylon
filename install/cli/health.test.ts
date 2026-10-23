import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS, type Config } from './config';
import { checks, waitForHealthy } from './health';
import type { Stack } from './docker';

// `health.ts` sleeps with Bun's timer (the CLI runs under Bun); vitest runs on node.
beforeEach(() => vi.stubGlobal('Bun', { sleep: () => Promise.resolve() }));
afterEach(() => vi.unstubAllGlobals());

const config: Config = { ...DEFAULTS };
// No mail: 5 TCP probes (connect, game, admin, proxy, register) + 3 HTTP (cash shop, marketplace, site).
const CHECK_COUNT = 8;

/** A Stack whose `exec` answers each round with the given per-check results (1 = ok). */
function fakeStack(rounds: string[][], onExec?: () => void): Stack {
  let call = 0;
  return {
    config,
    exec: async () => {
      onExec?.();
      const round = rounds[Math.min(call++, rounds.length - 1)] ?? [];
      return { code: 0, out: round.join('\n'), err: '' };
    },
  } as unknown as Stack;
}

const allOk = Array.from({ length: CHECK_COUNT }, () => '1');
const cashShopDown = allOk.map((v, i) => (i === 5 ? '0' : v)); // the 6th probe is the cash shop

describe('checks', () => {
  it('names every service in order and reads each line as its result', async () => {
    const results = await checks(fakeStack([allOk]));
    expect(results.map(r => r.name)).toEqual([
      'OpenMU connect server',
      'OpenMU game server',
      'OpenMU admin panel',
      'Proxy (websocket)',
      'Register',
      'Cash shop',
      'Marketplace',
      'Site',
    ]);
    expect(results.every(r => r.ok)).toBe(true);
  });

  it('marks a service that answered 0 as down', async () => {
    const results = await checks(fakeStack([cashShopDown]));
    expect(results.find(r => r.name === 'Cash shop')?.ok).toBe(false);
    expect(results.filter(r => !r.ok)).toHaveLength(1);
  });
});

describe('waitForHealthy', () => {
  it('returns at once when every service already answers', async () => {
    let calls = 0;
    const results = await waitForHealthy(fakeStack([allOk], () => calls++));
    expect(calls).toBe(1);
    expect(results.every(r => r.ok)).toBe(true);
  });

  it('keeps polling while a service is still coming up, then stops once it answers', async () => {
    // The stack the bug hit: the cash shop lags a round or two behind `up --wait`.
    let calls = 0;
    const results = await waitForHealthy(fakeStack([cashShopDown, cashShopDown, allOk], () => calls++));
    expect(calls).toBe(3);
    expect(results.every(r => r.ok)).toBe(true);
  });

  it('gives up at the deadline and hands back the last, failing round', async () => {
    const results = await waitForHealthy(fakeStack([cashShopDown]), 0);
    expect(results.find(r => r.name === 'Cash shop')?.ok).toBe(false);
  });
});
