import { isStackingPotion, itemDef } from '@/controllers/item_rules';
import type { Item } from '../../ecs/world';

/**
 * What the server will merge, and how far: OpenMU's `Item.IsStackable`
 * (non-wearable, definition durability > 1) and `Item.IsSameItemAs`
 * (same definition and level). The client item files do not carry the
 * server's definition durability for potions, so the known Season 6 stack
 * sizes are kept here.
 */

/** Group-14 stack sizes from OpenMU's Season 6 item data; anything else counted is conservatively 3. */
const POTION_LIMITS: readonly (readonly [number, number, number])[] = [
  [0, 6, 3],
  [7, 7, 10],
  [8, 8, 3],
  [35, 40, 3],
  [46, 50, 10],
  [85, 90, 10],
];

const DEFAULT_POTION_LIMIT = 3;

/** How many pieces fit in `item`'s square, or 0 when the server will not stack it. */
export function stackLimit(item: Item): number {
  const def = itemDef(item.group, item.num);
  // A non-wearable item whose file carries durability (arrows do, but they
  // are wearable, so the slot check keeps them out of this path).
  if (def && def.slot < 0 && def.durability > 1) return def.durability;

  if (!isStackingPotion(item.group, item.num)) return 0;
  for (const [first, last, limit] of POTION_LIMITS) {
    if (item.num >= first && item.num <= last) return limit;
  }
  return DEFAULT_POTION_LIMIT;
}

/** The free room left in `item`'s stack. */
export function stackRoom(item: Item): number {
  const limit = stackLimit(item);
  return limit > 0 ? Math.max(0, limit - (item.durability ?? 0)) : 0;
}

/** `IsSameItemAs`: same group, number and level, and both stackable. */
export function sameStack(a: Item, b: Item): boolean {
  return (
    a.group === b.group &&
    a.num === b.num &&
    (a.lvl ?? 0) === (b.lvl ?? 0) &&
    stackLimit(a) > 0 &&
    stackLimit(b) > 0
  );
}
