import { reaction } from 'mobx';
import { t } from '../../i18n';
import { Bag } from './state';
import { Session } from '../session';
import { addNotification } from '../chat';
import {
  itemSquares,
  planLayout,
  planStackMerge,
  squareFits,
  stampSquares,
  type Square,
} from './inventoryLayout';
import {
  gridFirstIndex,
  StorageKind,
  storageColumns,
  storageRows,
} from './itemStorage';

/**
 * Auto-arrange for the inventory grid: pack every loose item into the
 * top-left, kind by kind, so a hunt's worth of drops stops looking like a
 * shotgun blast. The layout itself is `inventoryLayout.ts`; this is the run.
 *
 * The server owns the grid, so this cannot be a local reshuffle: every step
 * is the same `ItemMoveRequest` a drag would send, and only one may be in
 * flight (`Bag.pendingItemMove`). So the run is a small state machine -
 * plan the layout, move one item per answered move, re-plan from what is
 * actually on the grid - and it stops the moment the player picks something
 * up, a move is rolled back, or the grid is packed.
 *
 * Two items can want each other's square (A sits on B's target and B on
 * A's). Nothing can move then, so one of them is parked on a free square at
 * the far end of the grid, which breaks the cycle at the cost of one extra
 * move.
 */

/** Ceiling on the moves one run may send: a full inventory may merge every stack and then pack. */
const MAX_MOVES = 256;

/** How many times a run may park a blocker to break a cycle. */
const MAX_PARKS = 6;

type Grid = {
  columns: number;
  rows: number;
  first: number;
  squares: Square[];
};

function read(storage: StorageKind): Grid {
  const items = Bag.itemsOfStorage(storage);
  const columns = storageColumns(storage);
  const rows = storageRows(storage);
  const first = gridFirstIndex(storage);
  const squares: Square[] = [];

  for (let square = 0; square < columns * rows; square++) {
    const item = items[first + square];
    if (!item) continue;
    squares.push({ slot: first + square, item, ...itemSquares(item) });
  }

  return { columns, rows, first, squares };
}

/** Occupancy of the live grid, with `ignore`'s own squares left free. */
function occupancy(grid: Grid, ignore: number): Uint8Array {
  const used = new Uint8Array(grid.columns * grid.rows);
  for (const entry of grid.squares) {
    if (entry.slot === ignore) continue;
    stampSquares(used, grid.columns, grid.rows, entry.slot - grid.first, entry.w, entry.h);
  }
  return used;
}

export const InventorySort = new (class _InventorySort {
  private storage: StorageKind = StorageKind.Inventory;
  private running = false;
  private moves = 0;
  private parks = 0;
  private stop: (() => void) | null = null;
  private failedMerges = new Set<string>();

  get active(): boolean {
    return this.running;
  }

  /**
   * Arrange `storage`. A second call while a run is going stops it (the key
   * is a toggle), because a half-finished run is still a valid grid.
   */
  start(storage: StorageKind = StorageKind.Inventory): void {
    if (this.running) {
      this.cancel();
      return;
    }
    if (Bag.pickedItem || Bag.pendingItemMove) return;

    this.storage = storage;
    this.running = true;
    this.moves = 0;
    this.parks = 0;
    this.failedMerges.clear();
    Bag.onStackMoveRefused = (refusedStorage, from, to) => {
      if (refusedStorage === this.storage) this.failedMerges.add(this.pairKey(from, to));
    };

    // Each answered move (`confirmItemMove` / `rollbackItemMove` clear the
    // pending record) releases the next one.
    this.stop = reaction(
      () => Bag.pendingItemMove === null,
      idle => {
        if (idle) this.step();
      }
    );

    this.step();
  }

  cancel(): void {
    this.finish();
  }

  private finish(done = false): void {
    this.stop?.();
    this.stop = null;
    this.running = false;
    Bag.onStackMoveRefused = null;
    if (done && this.moves > 0) addNotification(t('notify.inventorySorted'));
  }

  private step(): void {
    if (!this.running) return;

    // The player took over: their drag owns the grid, not this run.
    if (Bag.pickedItem || Bag.pendingItemMove) return;
    if (this.moves >= MAX_MOVES) {
      this.finish(true);
      return;
    }

    // Planned afresh every step: after a move (or a park) the grid is a
    // different grid, and a plan keyed by the old slots would be stale.
    const grid = read(this.storage);

    // Merge first: the layout is packed after the stack count stops falling.
    const merge = this.nextStackMerge(grid);
    if (merge) {
      this.moves++;
      if (!Bag.mergeItemStacks(this.storage, merge.from, merge.to)) {
        this.failedMerges.add(this.pairKey(merge.from, merge.to));
        this.step();
        return;
      }
      // Offline there is no answer to wait for, so drive the next step here.
      if (Session.isOffline) this.step();
      return;
    }

    const targets = planLayout(grid.squares, grid.columns, grid.rows, grid.first);
    const move = this.nextMove(grid, targets) ?? this.parkMove(grid, targets);
    if (!move) {
      this.finish(true);
      return;
    }

    this.moves++;
    if (!Bag.moveItemToSquare(this.storage, move.from, move.to)) {
      this.finish(true);
      return;
    }
    // Offline there is no answer to wait for, so drive the next step here.
    if (Session.isOffline) this.step();
  }

  /** The next merge worth asking the server for; vault moves cannot stack. */
  private nextStackMerge(grid: Grid): { from: number; to: number } | null {
    if (this.storage !== StorageKind.Inventory) return null;
    return planStackMerge(grid.squares, (from, to) =>
      this.failedMerges.has(this.pairKey(from, to))
    );
  }

  private pairKey(from: number, to: number): string {
    return `${from}:${to}`;
  }

  /** The next item that can go straight to its planned square. */
  private nextMove(grid: Grid, targets: Map<number, number>): { from: number; to: number } | null {
    for (const entry of grid.squares) {
      const to = targets.get(entry.slot);
      if (to === undefined || to === entry.slot) continue;

      const used = occupancy(grid, entry.slot);
      if (!squareFits(used, grid.columns, grid.rows, to - grid.first, entry.w, entry.h)) {
        continue;
      }

      return { from: entry.slot, to };
    }

    return null;
  }

  /**
   * Nothing can reach its target: two items are sitting on each other's
   * square. Move the first blocked one to a free square at the far end of
   * the grid, which unblocks the rest and is tidied by the next steps.
   */
  private parkMove(grid: Grid, targets: Map<number, number>): { from: number; to: number } | null {
    if (this.parks >= MAX_PARKS) return null;

    for (const entry of grid.squares) {
      const to = targets.get(entry.slot);
      if (to === undefined || to === entry.slot) continue;

      const used = occupancy(grid, entry.slot);
      for (let square = grid.columns * grid.rows - 1; square >= 0; square--) {
        if (grid.first + square === entry.slot) continue;
        if (!squareFits(used, grid.columns, grid.rows, square, entry.w, entry.h)) continue;

        this.parks++;
        return { from: entry.slot, to: grid.first + square };
      }
    }

    return null;
  }
})();
