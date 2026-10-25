# inventory

The hero's bag: the inventory packets, the grid model every item window shares (storage numbers,
sizes, slot spaces, bans) and the item runs built on it (auto-arrange, bulk move, Ctrl-click,
jewels, Q/W/E/R hotkeys), and `Bag`: the carried item, the move in flight and the item actions. The
items themselves are the hero's (`Hero.items`, `Hero.money`).

## Public API
- `InventoryConstants` (now `src/core/inventoryConstants.ts`, pure, also read by the cash shop server):
  equipment slot indices, `RowSize`, `InventoryRows`, `FirstStoreItemSlotIndex`, `WarehouseRows`.
- `StorageKind`, `VAULT_*` / `TRADE_*` / `MIX_*` / `PERSONAL_SHOP_*` sizes, `CHAOS_CARD_WIRE_STORAGE`, `SEED_WIRE_STORAGES` (`itemStorage.ts`): the other trays' wire bytes, the chaos machine's grid here.
- `gridFirstIndex`, `wireSlotOf`, `localIndexOf`, `storageColumns`, `storageRows`: local index vs wire slot per storage.
- `isVaultBanned`, `isTradeBanned`, `isPersonalShopBanned`, `storageBan(storage, item)`: what a grid refuses.
- `isEquipable(slot, item)`, `equipDestination(item, worn)` (`controllers/item_rules/equipSlots.ts`): where an
  item can be worn; there because the compare tooltip reads them.
- `findFreeSlot(occupied, rows, w, h)`: first-fit free square (`FindEmptySlot`).
- `itemSquares`, `stampSquares`, `squareFits`, `planStackMerge`: grid footprint and stack-merge planning
  (`inventoryLayout.ts`); `stackLimit`, `stackRoom`, `sameStack` (`itemStack.ts`).
- `InventorySort.start()`: auto-arrange. `BulkMove.start(from, to, wanted)`: move every matching item.
- `QuickItemActions`: Ctrl-click moves, sell / drop confirmations, the merchant's bulk buy. `MAX_BULK_BUY`.
- `isUpgradeJewel`, `jewelTargetError`, `JEWEL_OF_CHAOS` (`jewelUpgrade.ts`; versions re-export it as `jewelRules`).
- `ITEM_HOTKEY_CODES`, `canRegisterItemHotkey`, `canBindItemHotkey`, `findHotkeyItem`, `countHotkeyItems`,
  `HOTKEY_COUNT`, `UNBOUND_HOTKEY`. `canBindItemHotkey(features.itemHotkeys, slot)` is the one rule the bar's
  drop and the inventory's Ctrl+key bind by: a slot the bar draws, on a version whose slots bind
  (`setItemHotkey` refuses the rest; 0.97d's Q / W / E are fixed).

## How it works
- State is `Bag` (`state.ts`, through `index.ts`, the door): `pickedItem`, `pendingItemMove`, `itemHotkeys`
  (open state: `MuWindows.isOpen('inventory')`; the items are `Hero.items`). Actions: `pickItem`, `placePickedItem`, `cancelPickedItem`,
  `moveItemToSquare`, `mergeItemStacks`, `autoMoveItem`, `findFreeSquare`, `itemsOfStorage`, `confirmItemMove`,
  `confirmStackMove`, `stackMoveFailed`, `rollbackItemMove`, `applyPickedJewel`, `consumeItemRequest`,
  `upgradeInventoryItem`, `setItemHotkey`, `useItemHotkey`, `learnSkillItem`, `dropPickedItem`, `beginItemMove`.
  `beforeConsume` is the npc_shop's hook: a use
  closes the merchant window first. The door also exports `itemSize`, `ITEM_MOVE_TIMEOUT`, `PickedItem`.
- The server owns every grid. A move is one `ItemMoveRequest`; only one is in flight (`Bag.pendingItemMove`).
  `ItemMoved` paints it, `ItemMoveRequestFailed` rolls a normal move back (stack moves are the exception
  below). `Bag.itemsOfStorage` maps a `StorageKind`
  to the bag or to an `Economy` grid, so pick / place code is written once. The economy hands its
  grids in (`Bag.grids`, type `EconomyGrids`) when it loads, so the bag never imports it back.
- Local index vs wire slot: the bag array starts with the 12 worn slots; the personal shop sits inside the
  inventory storage at `FirstStoreItemSlotIndex` on OpenMU, so only its slots are shifted.
- `InventorySort` and `BulkMove` are small state machines: send one move, wait for the answer (a mobx
  `reaction` on `pendingItemMove`), plan again. A step does nothing while the player holds an item.
  `inventoryLayout.ts` is the pure packing (by kind, big items first, first fit).
- Auto-arrange merges first, then packs. `planStackMerge` picks two squares the server will stack
  (`sameStack`: same definition and level, both stackable), preferring a complete merge; a partial
  merge leaves the source remainder in place for the next plan and never drains a full stack (that
  would only swap a 2 and a 3 forever). Merging only happens in the player's inventory: OpenMU's
  `MoveItemAction` refuses to stack vault-to-vault, so the vault stays packing-only.
  `stackLimit` keeps the Season 6 potion sizes the client item files omit (3 for most, 10 for the siege
  and event potions); `isStackingPotion` decides which group-14 `durability` values are piece counts.
- A stack move is not an `ItemMoved` move. OpenMU's `FullStackAsync` / `PartiallyStackAsync` send
  `ItemMoveRequestFailed` first, then the real answer: `ItemRemoved(source)` + target
  `ItemDurabilityChanged` for a complete merge, or source + target `ItemDurabilityChanged` for a partial
  one. `Bag.mergeItemStacks` keeps the source in its square until then; `stackMoveFailed` waits
  `STACK_MOVE_GRACE` for those packets and only then treats the failure as a refusal, remembering the
  source/target pair (`Bag.onStackMoveRefused`) so the run does not retry it forever.
- Ctrl-click: `quickItemRules.ts` decides (storage window wins over the merchant, valuable items ask first),
  `quickItemActions.ts` sends the same requests a drag would. Ctrl-click needs `GameOptions.quickItemActions`,
  the yes/no needs `GameOptions.confirmValuableItems`.
- Jewels: `jewelTargetError` mirrors `ApplyJewels` (NewUIMyInventory.cpp:1546); the server has the last word.
- Hotkeys: a slot holds an item kind, not an item (`CNewUIItemHotKey`, NewUIMainFrameWindow.cpp:929-1320).
- Automatic mana potion (`autoMana.ts`, ours): where the world's `server.json` sets `autoManaPotion`
  and the player's option of that name is on, mana under a tenth drinks the potion the unbound W
  key would (`findHotkeyItem`, the same `consumeItemRequest`), at most once a second, alive and in
  the world. The original never drinks by itself, so both default off.

## Packets
- `CharacterInventory`: the full bag, emptied first (WSclient.cpp:1672-1683); slots past `FirstStoreItemSlotIndex` go to `Economy.myShopItems`.
- `ItemMoved`: the server's answer to a move, into any storage (chaos card byte 9 maps to the chaos machine).
- `ItemMoveRequestFailed`: rolls a normal move back. For a stack move it is the server's first packet
  even on success; the removal/durability packets decide, and only a failure with no follow-up rolls
  back (`STACK_MOVE_GRACE`).
- `ItemAddedToInventory`: one slot set, with the pickup sound (WSclient.cpp:5727-5734). `ItemRemoved`: one slot cleared.
- `InventoryItemUpgraded` / `ItemConsumptionFailed`: the result of a jewel or a consume.
- `ItemDurabilityChanged`, `InventoryMoneyUpdate`: durability of one slot, zen in the bag. A durability change
  `ByConsumption` answers a use: the 300 ms use lock ends at once (`Bag.useAnswered`, `EnableUse = 0`,
  WSclient.cpp:7164-7167).
- `ConsumeItemWithEffect` (0x29, Ale, Potion of Soul): answers a use the same way (WSclient.cpp:7190). Its
  timer only changed the ping's attack speed and an unused hero light in the original, so nothing else shows.

## Depends on / used by
- uses: `session` (sending), `hero` (the items), `skills` (`HeroSkills`, learning from a scroll),
  `controllers/item_rules` (`ItemSerializer`, `itemDef`, `dropTier`), `economy` (`Economy`, which reads
  `Bag` back), `controllers/settings`, `servers/serverManifest.ts` (`autoManaPotion`),
  `controllers/sound`, `controllers/net/roundTrip`, `controllers/assets/itemIconPack`, `src/i18n`.
- used by: `src/app/logic.ts` (net), `npc_shop`, `economy`, `personal_shop`, `controllers/item_rules/itemCompare.ts`, `hero`, `mu_helper`,
  `warp`, `scope`, `marketplace`, `cashshop/server/fulfilment.ts`, ecs systems (attack, pickup, keyboard).
- windows: `inventory`, `vault`, `trade`, `chaos_machine`, `personal_shop`, `npc_shop`, `economy_prompts`,
  `character_info`, `pet_info`; HUD `bottom_bar`.

## Change it
- a new inventory packet: add an `EventBus.on(...)` in `net.ts`, keep state in `Bag` (`state.ts`).
- a new storage grid: add it to `storageKind.ts` / `itemStorage.ts` (size, columns, rows), `Bag.itemsOfStorage`
  and `KNOWN_STORAGES` in `net.ts`.
- what a grid refuses: the ban lists in `itemStorage.ts`.
- arrange order: `itemCategory` / `compareSquares` in `inventoryLayout.ts`.
- jewel rules: `jewelTargetError` in `jewelUpgrade.ts`. Hotkey search: `searchRange` in `itemHotkeys.ts`.
  Rings and pendants take Bless, Soul and Life only when `jewelryUpgradeAllowed()` (`jewelryUpgrade.ts`: the improvement, on a world whose `server.json` allows it).

## Tests
- `inventoryFit.test.ts`: `findFreeSlot` first fit, edge clipping, ignored slots, row count.
- `inventoryLayout.test.ts`: `planLayout` packs into the top-left, no overlaps, leaves a packed grid alone;
  `planStackMerge` prefers complete merges, skips full stacks and different levels, and knows the potion limits.
- `inventorySort.test.ts`: offline auto-arrange merges mana potions before packing, stops when a full
  stack sits beside a partial one, and leaves vault stacks alone.
- `quickItemRules.test.ts`: Ctrl-click target, `isValuableItem`, when a bulk buy stops.
- `itemStorage.test.ts`: `storageBan` returns a translated refusal per storage.
- `itemHotkeys.test.ts`: which slots a version lets Ctrl+key or a drop bind.
- `net.test.ts`: `CharacterInventory` empties the bag and the stall before filling them; a stack answer waits
  for the removal/durability packets, and a bare `ItemMoveRequestFailed` becomes a refusal.
- `jewelUpgrade.test.ts`: a ring or pendant takes Bless, Soul and Life only with `jewelryUpgrade` on a world that allows it.
- `autoMana.test.ts`: low mana drinks the W key's mana potion once a second, and nothing happens
  where the server or the player has not turned it on, for a dead hero or with no potion.
