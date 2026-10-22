import { afterEach, describe, expect, it, vi } from 'vitest';

// The options module reads storage once, when it is imported, so each case stubs a map and reloads it.

const OVERRIDES = {
  loginTokens: true,
  muHelperButtons: true,
  noticeLinks: true,
  openRooms: true,
  roofFade: true,
};

function store(saved: Map<string, string>): void {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => void saved.set(key, value),
    removeItem: (key: string) => void saved.delete(key),
  });
}

/** A boot over `saved`: fresh module, so its `load` runs again. */
async function boot(saved: Map<string, string>) {
  store(saved);
  vi.resetModules();
  const { GameOptions } = await import('./gameOptions');

  return GameOptions;
}

const savedBlob = (saved: Map<string, string>) =>
  JSON.parse(saved.get('mu_options') ?? '{}') as Record<string, unknown>;

describe('the one-time defaults revision', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('puts an old save on Video Qualidade Classic and Fidelity Classic with the five, keeping the rest', async () => {
    const saved = new Map([
      [
        'mu_options',
        JSON.stringify({
          fidelity: 1,
          fidelityOverrides: {},
          lightingQuality: 2,
          materialQuality: 2,
          materialDetail: 3,
          shadows: false,
          chatSystemMessages: false,
          uiScale: 4,
        }),
      ],
    ]);

    const options = await boot(saved);

    expect(options.lightingQuality).toBe(0);
    expect(options.materialQuality).toBe(0);
    expect(options.fidelity).toBe(0);
    expect(options.fidelityOverrides).toEqual(OVERRIDES);
    // The player's own costs and everything else are theirs.
    expect(options.materialDetail).toBe(3);
    expect(options.shadows).toBe(false);
    expect(options.chatSystemMessages).toBe(false);
    expect(options.uiScale).toBe(4);
    // Written back, so the next boot reads the same instead of the old blob.
    expect(savedBlob(saved).lightingQuality).toBe(0);
    expect(savedBlob(saved).fidelity).toBe(0);
    expect(savedBlob(saved).fidelityOverrides).toEqual(OVERRIDES);
  });

  it('runs once per browser: choices made after it survive the next boot', async () => {
    const saved = new Map<string, string>();
    await boot(saved);

    // The player goes back to Ultra lighting and Enhanced fidelity; this is the client's save.
    saved.set('mu_options', JSON.stringify({ lightingQuality: 2, fidelity: 1, fidelityOverrides: {} }));
    const again = await boot(saved);

    expect(again.lightingQuality).toBe(2);
    expect(again.fidelity).toBe(1);
    expect(again.fidelityOverrides).toEqual({});
  });

  it('a fresh install starts on it without writing a save', async () => {
    const saved = new Map<string, string>();
    const options = await boot(saved);

    expect(options.lightingQuality).toBe(0);
    expect(options.materialQuality).toBe(0);
    expect(options.fidelity).toBe(0);
    expect(options.fidelityOverrides).toEqual(OVERRIDES);
    expect(saved.has('mu_options')).toBe(false);
  });
});
