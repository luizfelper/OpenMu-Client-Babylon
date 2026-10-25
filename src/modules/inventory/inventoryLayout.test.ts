import { describe, expect, it } from 'vitest';
import { planLayout, planStackMerge, type Square } from './inventoryLayout';
import { sameStack, stackLimit } from './itemStack';
import type { Item } from '../../ecs/world';

const item = (group: number, num: number, lvl = 0, durability?: number): Item => ({
  group,
  num,
  lvl,
  durability,
});

const square = (slot: number, w: number, h: number, group = 0, num = 0): Square => ({
  slot,
  item: item(group, num),
  w,
  h,
});

const potion = (slot: number, durability: number, num = 5, lvl = 0): Square => ({
  slot,
  item: item(14, num, lvl, durability),
  w: 1,
  h: 1,
});

/** A 8x8 grid whose local indices start at 12, like the inventory's. */
const COLUMNS = 8;
const ROWS = 8;
const FIRST = 12;

describe('inventory auto-arrange', () => {
  it('packs scattered items into the top-left', () => {
    const targets = planLayout(
      [square(FIRST + 40, 1, 1), square(FIRST + 63, 1, 1), square(FIRST + 17, 1, 1)],
      COLUMNS,
      ROWS,
      FIRST
    );

    expect([...targets.values()].sort((a, b) => a - b)).toEqual([
      FIRST,
      FIRST + 1,
      FIRST + 2,
    ]);
  });

  it('gives every item a square of its own', () => {
    const squares = [
      square(FIRST + 5, 2, 3),
      square(FIRST + 20, 2, 2),
      square(FIRST + 33, 1, 1),
      square(FIRST + 44, 2, 3),
    ];

    const targets = planLayout(squares, COLUMNS, ROWS, FIRST);
    const used = new Set<number>();

    for (const entry of squares) {
      const target = targets.get(entry.slot);
      expect(target).toBeDefined();
      if (target == null) continue;
      const column = (target - FIRST) % COLUMNS;
      const row = (target - FIRST - column) / COLUMNS;
      expect(column + entry.w).toBeLessThanOrEqual(COLUMNS);
      expect(row + entry.h).toBeLessThanOrEqual(ROWS);
      for (let y = 0; y < entry.h; y++) {
        for (let x = 0; x < entry.w; x++) {
          const cell = (row + y) * COLUMNS + column + x;
          expect(used.has(cell)).toBe(false);
          used.add(cell);
        }
      }
    }
  });

  it('leaves a grid that is already packed alone', () => {
    const squares = [square(FIRST, 1, 1), square(FIRST + 1, 1, 1)];
    const targets = planLayout(squares, COLUMNS, ROWS, FIRST);

    for (const entry of squares) {
      expect(targets.get(entry.slot)).toBe(entry.slot);
    }
  });
});

describe('inventory stack merging', () => {
  it('merges mana potions, preferring a complete stack', () => {
    const squares = [potion(FIRST, 1), potion(FIRST + 3, 1)];
    expect(planStackMerge(squares)).toEqual({ from: FIRST + 3, to: FIRST });
  });

  it('leaves full stacks alone', () => {
    expect(planStackMerge([potion(FIRST, 3), potion(FIRST + 1, 3)])).toBeNull();
  });

  it('partially fills a target when no source fits whole', () => {
    const squares = [potion(FIRST, 2), potion(FIRST + 1, 2)];
    expect(planStackMerge(squares)).toEqual({ from: FIRST + 1, to: FIRST });
  });

  it('does not swap a full stack with a partial one forever', () => {
    expect(planStackMerge([potion(FIRST, 2), potion(FIRST + 1, 3)])).toBeNull();
    expect(planStackMerge([potion(FIRST, 3), potion(FIRST + 1, 2)])).toBeNull();
  });

  it('does not merge different item levels', () => {
    const squares = [potion(FIRST, 1, 5, 0), potion(FIRST + 1, 1, 5, 1)];
    expect(planStackMerge(squares)).toBeNull();
  });

  it('does not merge an item the server will not stack', () => {
    const squares = [potion(FIRST, 1, 13), potion(FIRST + 1, 1, 13)];
    expect(planStackMerge(squares)).toBeNull();
  });

  it('knows the stack sizes the client item files omit', () => {
    expect(stackLimit(item(14, 5, 0, 1))).toBe(3);
    expect(stackLimit(item(14, 7, 0, 1))).toBe(10);
    expect(stackLimit(item(14, 46, 0, 1))).toBe(10);
    expect(stackLimit(item(14, 13, 0, 1))).toBe(0);
    // Arrows carry durability 255 in the item file but are wearable, so
    // OpenMU's IsStackable refuses them.
    expect(stackLimit(item(4, 15, 0, 255))).toBe(0);
  });

  it('compares the item definition and level, not the slot', () => {
    expect(sameStack(item(14, 5, 0, 1), item(14, 5, 0, 2))).toBe(true);
    expect(sameStack(item(14, 5, 0, 1), item(14, 5, 1, 1))).toBe(false);
    expect(sameStack(item(14, 5, 0, 1), item(14, 6, 0, 1))).toBe(false);
  });
});
