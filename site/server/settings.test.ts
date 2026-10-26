// Runs under `bun test` (`bun run test:server`) like vip.test.ts: the settings read the site's
// `bun:sqlite` database, which vitest under Node cannot import.
import { describe, expect, it } from 'bun:test';
import { publicSite } from './settings';

describe('site copy', () => {
  const site = publicSite();
  const vip = site.vip as { notice: string; support_email: string };

  it('invites people to VIP instead of describing how benefits are configured', () => {
    expect(vip.notice).toContain('ajuda a manter o servidor online');
    expect(vip.notice).not.toMatch(/cadastrad|administra/i);
    expect(JSON.stringify(site.faq)).not.toMatch(/cadastrad|administra/i);
  });

  it('ships a support e-mail for a purchase that went wrong', () => {
    expect(vip.support_email).toBe('luizfelper@gmail.com');
  });
});
