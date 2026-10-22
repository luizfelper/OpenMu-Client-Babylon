import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { autorun, runInAction } from 'mobx';
import { FIDELITY_CLASSIC, FIDELITY_DEFAULT } from '@/controllers/fidelity';
import { improvementOnChoice, setGameOption } from '@/controllers/settings';

vi.stubGlobal('location', { search: '', hostname: 'localhost', href: 'http://localhost/' });
const { MuHelperButtons } = await import('.');
const { Ecs } = await import('@/ecs/current');

/** The buttons read the stored choice, so a test sets it the way the Fidelity page does. */
function choice(preset: number, overrides: Record<string, boolean> = {}): void {
  setGameOption('fidelity', preset);
  setGameOption('fidelityOverrides', overrides);
}

describe('the MU Helper HUD buttons (muHelperButtons)', () => {
  afterEach(() => {
    runInAction(() => {
      Ecs.world = null;
    });
    choice(FIDELITY_DEFAULT);
  });

  it('shows Start and Settings in the world on Enhanced', () => {
    choice(FIDELITY_DEFAULT);
    runInAction(() => {
      Ecs.world = { playerEntity: {} } as never;
    });
    const html = renderToStaticMarkup(<MuHelperButtons />);
    expect(html).toContain('Start helper');
    expect(html).toContain('Helper settings');
  });

  it('draws nothing on Classic', () => {
    choice(FIDELITY_CLASSIC);
    runInAction(() => {
      Ecs.world = { playerEntity: {} } as never;
    });
    expect(renderToStaticMarkup(<MuHelperButtons />)).toBe('');
  });

  it('comes back when Classic gets the muHelperButtons override, so the box is not a no-op', () => {
    choice(FIDELITY_CLASSIC);
    runInAction(() => {
      Ecs.world = { playerEntity: {} } as never;
    });
    expect(renderToStaticMarkup(<MuHelperButtons />)).toBe('');

    choice(FIDELITY_CLASSIC, { muHelperButtons: true });
    expect(renderToStaticMarkup(<MuHelperButtons />)).toContain('Start helper');
  });

  it('an observer reacts to the box on its own, which is what a stale isOn could not do', () => {
    choice(FIDELITY_CLASSIC);
    const seen: boolean[] = [];
    const dispose = autorun(() => seen.push(improvementOnChoice('muHelperButtons')));
    choice(FIDELITY_CLASSIC, { muHelperButtons: true });
    dispose();
    expect(seen).toEqual([false, true]);
  });
});
