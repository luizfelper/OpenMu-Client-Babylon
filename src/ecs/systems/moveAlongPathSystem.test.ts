import { describe, expect, it, vi } from 'vitest';
import type { Entity, World } from '../world';

vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.location ??= { href: 'http://localhost/', search: '', hostname: 'localhost', protocol: 'http:' };
});

const { MoveAlongPathSystem } = await import('./moveAlongPathSystem');

function hero(): Entity {
  return {
    transform: { pos: { x: 10, z: 10, y: 0 }, rot: { y: 0 } },
    pathfinding: {
      path: [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 12, y: 10 }],
      from: { x: 10, y: 10 },
      to: { x: 12, y: 10 },
      calculated: true,
      sentThrough: undefined,
    },
    movement: { velocity: { x: 0, y: 0 } },
    localPlayer: true,
    playerAnimation: {},
    attributeSystem: {
      hasAttribute: (name: string) => name === 'totalMovementSpeed',
      getValue: () => 3.75,
      setValue: () => { },
    },
    buffs: new Set(),
  } as unknown as Entity;
}

/** The system walks `query`; only the local player matters here. */
function run(entity: Entity): void {
  const w = {
    mapIndex: 0,
    terrain: null,
    getTerrainFlag: () => 0,
    with: () => [entity],
    getTerrainHeight: () => 0,
  } as unknown as World;
  MoveAlongPathSystem(w).update?.(0.25);
}

describe('the walk never arrives before the server', () => {
  it('waits for the WalkRequest of a fresh path instead of walking one tile ahead', () => {
    const entity = hero();
    run(entity);
    expect(entity.transform?.pos).toEqual({ x: 10, z: 10, y: 0 });
  });

  it('walks only up to the last tile the server was told about', () => {
    const entity = hero();
    const path = entity.pathfinding?.path ?? [];
    entity.pathfinding.sentThrough = path[1];
    run(entity);
    // The 0.25 s at 3.75 tiles/s are 0.94 tiles, but the sent chunk ends at 11:
    // the hero stops there and never reaches the unsent 12.
    const x = entity.transform?.pos.x ?? 0;
    expect(x).toBeGreaterThan(10);
    expect(x).toBeLessThanOrEqual(11.0001);
  });
});
