import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInAction } from 'mobx';
import type { Item } from '@/ecs/world';

vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.location ??= { href: 'http://localhost/', search: '', hostname: 'localhost', protocol: 'http:' };
});

// Skills first: they keep the app import cycle in order (versions/shared/skills/readme.md).
await import('@versions/shared/skills/skillVisuals');
const { installNet } = await import('./net');
const { Hero } = await import('@/modules/hero');
const { Economy } = await import('../economy/economy');
const { EventBus } = await import('@/core/eventBus');
const {
  CharacterInventoryPacket,
  ConsumeItemWithEffectPacket,
  ItemDurabilityChangedPacket,
  ItemMoveRequestFailedPacket,
  ItemRemovedPacket,
} = await import('@versions/shared/packets/ServerToClientPackets');
const { Bag, STACK_MOVE_GRACE } = await import('./state');
const { Session } = await import('../session');
const { StorageKind } = await import('./itemStorage');

installNet();

// ReceiveInventoryExtended (WSclient.cpp:1672-1683): the whole bag comes in one packet.
describe('CharacterInventory', () => {
  it('empties the bag and the stall before filling them', () => {
    const left = { group: 0, id: 1 } as unknown as Item;
    runInAction(() => {
      Hero.items[12] = left;
      Economy.myShopItems[3] = left;
    });
    const p = CharacterInventoryPacket.createPacket(6); // header + count 0
    EventBus.emit('CharacterInventory', p.buffer);
    expect(Hero.items[12]).toBeNull();
    expect(Economy.myShopItems[3]).toBeNull();
  });
});

// EnableUse = 0 on the answer: ReceiveDurability's consumption flag (WSclient.cpp:7164-7167) and ReceiveHelperItem (:7190).
describe('the answer to a use', () => {
  const sent = vi.spyOn(Session, 'sendToGS').mockImplementation(() => {});
  const use = () => {
    sent.mockClear();
    Bag.consumeItemRequest(20);
    return sent.mock.calls.length;
  };

  it('lets the next use go at once after a durability change by consumption', () => {
    runInAction(() => (Session.isOffline = false));
    expect(use()).toBe(1);
    expect(use()).toBe(0);
    const p = ItemDurabilityChangedPacket.createPacket();
    p.InventorySlot = 20;
    p.Durability = 2;
    p.ByConsumption = false;
    EventBus.emit('ItemDurabilityChanged', p.buffer);
    expect(use()).toBe(0);
    p.ByConsumption = true;
    EventBus.emit('ItemDurabilityChanged', p.buffer);
    expect(use()).toBe(1);
  });

  it('lets the next use go at once after an item with an effect (Ale)', () => {
    expect(use()).toBe(0);
    const p = ConsumeItemWithEffectPacket.createPacket();
    p.EffectTimeInSeconds = 60;
    EventBus.emit('ConsumeItemWithEffect', p.buffer);
    expect(use()).toBe(1);
  });
});

describe('a stack move answer', () => {
  beforeEach(() => {
    vi.spyOn(Session, 'sendToGS').mockImplementation(() => {});
  });

  const mana = (durability: number): Item => ({ group: 14, num: 5, lvl: 0, durability });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Bag.rollbackItemMove();
    Bag.onStackMoveRefused = null;
    runInAction(() => {
      Session.isOffline = false;
      Hero.items.fill(null);
    });
  });

  it('waits for the removal and target durability of a complete merge', () => {
    runInAction(() => {
      Session.isOffline = false;
      Hero.items[12] = mana(1);
      Hero.items[20] = mana(1);
    });
    const send = vi.mocked(Session.sendToGS);
    send.mockClear();

    expect(Bag.mergeItemStacks(StorageKind.Inventory, 20, 12)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(Bag.pendingItemMove?.stack).toBe(true);
    expect(Hero.items[20]).not.toBeNull();

    EventBus.emit('ItemMoveRequestFailed', ItemMoveRequestFailedPacket.createPacket(7).buffer);
    expect(Bag.pendingItemMove?.stack).toBe(true);

    const removed = ItemRemovedPacket.createPacket();
    removed.InventorySlot = 20;
    EventBus.emit('ItemRemoved', removed.buffer);
    expect(Hero.items[20]).toBeNull();
    expect(Bag.pendingItemMove?.stack).toBe(true);

    const changed = ItemDurabilityChangedPacket.createPacket();
    changed.InventorySlot = 12;
    changed.Durability = 2;
    changed.ByConsumption = false;
    EventBus.emit('ItemDurabilityChanged', changed.buffer);

    expect(Hero.items[12]).toMatchObject({ durability: 2 });
    expect(Bag.pendingItemMove).toBeNull();
  });

  it('keeps the source remainder of a partial merge', () => {
    runInAction(() => {
      Session.isOffline = false;
      Hero.items[12] = mana(2);
      Hero.items[20] = mana(2);
    });

    expect(Bag.mergeItemStacks(StorageKind.Inventory, 20, 12)).toBe(true);
    EventBus.emit('ItemMoveRequestFailed', ItemMoveRequestFailedPacket.createPacket(7).buffer);

    const source = ItemDurabilityChangedPacket.createPacket();
    source.InventorySlot = 20;
    source.Durability = 1;
    source.ByConsumption = false;
    EventBus.emit('ItemDurabilityChanged', source.buffer);
    expect(Hero.items[20]).toMatchObject({ durability: 1 });
    expect(Bag.pendingItemMove?.stack).toBe(true);

    const target = ItemDurabilityChangedPacket.createPacket();
    target.InventorySlot = 12;
    target.Durability = 3;
    target.ByConsumption = false;
    EventBus.emit('ItemDurabilityChanged', target.buffer);

    expect(Hero.items[12]).toMatchObject({ durability: 3 });
    expect(Hero.items[20]).toMatchObject({ durability: 1 });
    expect(Bag.pendingItemMove).toBeNull();
  });

  it('treats a failure with no stack packets as a refusal', () => {
    vi.useFakeTimers();
    const refused = vi.fn();
    Bag.onStackMoveRefused = refused;
    runInAction(() => {
      Session.isOffline = false;
      Hero.items[12] = mana(1);
      Hero.items[20] = mana(1);
    });

    expect(Bag.mergeItemStacks(StorageKind.Inventory, 20, 12)).toBe(true);
    EventBus.emit('ItemMoveRequestFailed', ItemMoveRequestFailedPacket.createPacket(7).buffer);
    expect(Bag.pendingItemMove?.stack).toBe(true);

    vi.advanceTimersByTime(STACK_MOVE_GRACE);

    expect(Bag.pendingItemMove).toBeNull();
    expect(Hero.items[20]).not.toBeNull();
    expect(refused).toHaveBeenCalledWith(StorageKind.Inventory, 20, 12);
  });
});
