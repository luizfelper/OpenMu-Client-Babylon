// Runs under `bun test` (`bun run test:server`) like the marketplace and cash shop suites:
// the site's database is `bun:sqlite`, which vitest under Node cannot import.
import { describe, expect, it } from 'bun:test';
import { db } from './db';
import { vipHistory, vipStatus } from './vip';

const DAY = 86_400_000;

describe('VIP status and history', () => {
  it('the newest unexpired entitlement is the active plan, old ones stay in the history', () => {
    const now = Date.now();
    db.exec(`INSERT INTO vip_entitlements (account, plan_id, plan_name, starts_at, expires_at, source_order, created_at)
      VALUES ('HistUser', 'bronze', 'VIP Bronze', ${now - 5 * DAY}, ${now - DAY}, 'h1', ${now - 5 * DAY})`);
    db.exec(`INSERT INTO vip_entitlements (account, plan_id, plan_name, starts_at, expires_at, source_order, created_at)
      VALUES ('histuser', 'prata', 'VIP Prata', ${now - DAY}, ${now + 20 * DAY}, 'h2', ${now - DAY})`);

    // Case-insensitive like the rest of the site's account matching.
    const status = vipStatus('HistUser');
    expect(status.active).toBe(true);
    expect(status.planName).toBe('VIP Prata');
    expect(status.planId).toBe('prata');

    const history = vipHistory('HistUser');
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ plan_name: 'VIP Prata', active: true });
    expect(history[1]).toMatchObject({ plan_name: 'VIP Bronze', active: false });
  });

  it('an account without entitlements has no status and an empty history', () => {
    const status = vipStatus('NobodyHere');
    expect(status.active).toBe(false);
    expect(vipHistory('NobodyHere')).toHaveLength(0);
  });
});
