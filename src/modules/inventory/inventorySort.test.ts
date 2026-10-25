import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInAction } from 'mobx';
import type { Item } from '@/ecs/world';

vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.location ??= { href: 'http://localhost/', search: '', hostname: 'localhost', protocol: 'http:' };
});

// Skills first: they keep the app import cycle in order (versions/shared/skills/readme.md).
await import('@versions/shared/skills/skillVisuals');
const { InventorySort } = await import('./inventorySort');
const { Bag } = await import('./state');
const { Hero } = await import('@/modules/hero');
const { Session } = await import('../session');
const { StorageKind, VAULT_SLOTS } = await import('./itemStorage');

const mana = (durability: number): Item => ({ group: 14, num: 5, lvl: 0, durability });

afterEach(() => {
  InventorySort.cancel();
  Bag.grids = null;
  runInAction(() => {
    Session.isOffline = false;
    Hero.items.fill(null);
  });
});

describe('InventorySort stack merging', () => {
  it('merges mana potions before packing them', () => {
    runInAction(() => {
      Session.isOffline = true;
      Hero.items[12] = mana(1);
      Hero.items[20] = mana(1);
      Hero.items[30] = mana(1);
    });

    InventorySort.start(StorageKind.Inventory);

    expect(Hero.items[12]).toMatchObject({ group: 14, num: 5, durability: 3 });
    expect(Hero.items[20]).toBeNull();
    expect(Hero.items[30]).toBeNull();
    expect(InventorySort.active).toBe(false);
  });

  it('stops when a full stack sits beside a partial one', () => {
    runInAction(() => {
      Session.isOffline = true;
      Hero.items[12] = mana(2);
      Hero.items[13] = mana(3);
    });

    InventorySort.start(StorageKind.Inventory);

    expect(Hero.items[12]).toMatchObject({ durability: 2 });
    expect(Hero.items[13]).toMatchObject({ durability: 3 });
    expect(InventorySort.active).toBe(false);
  });

  it('leaves vault stacks alone: OpenMU only stacks inventory-to-inventory', () => {
    const vault: (Item | null)[] = new Array(VAULT_SLOTS).fill(null);
    vault[0] = mana(1);
    vault[1] = mana(1);
    vault[2] = mana(1);
    Bag.grids = {
      items: () => vault,
      mixWireStorage: () => 3,
      storageOpen: () => false,
    };

    runInAction(() => {
      Session.isOffline = true;
    });
    InventorySort.start(StorageKind.Vault);

    expect(vault[0]).toMatchObject({ durability: 1 });
    expect(vault[1]).toMatchObject({ durability: 1 });
    expect(vault[2]).toMatchObject({ durability: 1 });
  });
});
