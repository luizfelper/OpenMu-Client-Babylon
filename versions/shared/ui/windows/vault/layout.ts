import type { TextKey } from '@/i18n';
import { VAULT_COLUMNS, VAULT_ROWS } from '@/modules/inventory/itemStorage';

/**
 * `CNewUIStorageInventory` (NewUIStorageInventory.cpp): the 190×429 item
 * frame with the 8×15 grid at (15, 36), the money well at (10, 342) and the
 * three buttons on the bottom edge at 37px pitch from x = 13.
 */

export const COLUMNS = VAULT_COLUMNS;
export const ROWS = VAULT_ROWS;

export const GRID_X = 15;
export const GRID_Y = 36;

export const TITLE_Y = 11;
/** GlobalText[234] + GlobalText[240] / [241]. */
export const TITLE: TextKey = 'vault.title';
export const TITLE_UNLOCKED: TextKey = 'vault.unlocked';
export const TITLE_LOCKED: TextKey = 'vault.locked';

/** The find box and the jewel button share the strip under the title. */
export const SEARCH_X = GRID_X;
export const SEARCH_Y = 21;
export const SEARCH_WIDTH = 106;
export const BULK_WIDTH = 46;

export const MONEY_SPRITE = 'newui_item_money3.OZT';
export const MONEY_X = 10;
export const MONEY_Y = 342;
export const MONEY_WIDTH = 170;
export const MONEY_HEIGHT = 46;

export const MONEY_TEXT_RIGHT = 168;
export const MONEY_TEXT_Y = MONEY_Y + 8;

/** GlobalText[266]: the warehouse fee line, red label + gold amount. */
export const FEE_LABEL: TextKey = 'vault.fee';
export const FEE_LABEL_X = MONEY_X + 15;
export const FEE_TEXT_Y = MONEY_Y + 29;

export const BUTTON_Y = 391;
export const BUTTON_WIDTH = 36;
export const BUTTON_HEIGHT = 29;
export const BUTTON_FRAMES = { up: 0, down: 1, check: 1 } as const;

const BUTTON_X0 = 13;
const BUTTON_PITCH = 37;

export const DEPOSIT_BUTTON_X = BUTTON_X0;
export const WITHDRAW_BUTTON_X = BUTTON_X0 + BUTTON_PITCH;
export const LOCK_BUTTON_X = BUTTON_X0 + BUTTON_PITCH * 2;

/**
 * Ours, in the slot after the original's three buttons: the inventory's
 * rearrange button, arranging the vault grid instead.
 */
export const REARRANGE_BUTTON_X = BUTTON_X0 + BUTTON_PITCH * 3;
export const REARRANGE_BUTTON_Y = BUTTON_Y;
export const REARRANGE_BUTTON_WIDTH = BUTTON_WIDTH;
export const REARRANGE_BUTTON_HEIGHT = BUTTON_HEIGHT;

export const DEPOSIT_SPRITE = 'newui_Bt_money01.OZT';
export const WITHDRAW_SPRITE = 'newui_Bt_money02.OZT';
export const UNLOCKED_SPRITE = 'newui_Bt_lock02.OZT';
export const LOCKED_SPRITE = 'newui_Bt_lock.OZT';
/** The blank MU button sprite, carrying our own icon like the inventory's. */
export const REARRANGE_SPRITE = 'newui_btn_empty.OZT';

/** GlobalText[235] / [236] / [242]. */
export const DEPOSIT_TOOLTIP: TextKey = 'vault.deposit';
export const WITHDRAW_TOOLTIP: TextKey = 'vault.withdraw';
export const LOCK_TOOLTIP: TextKey = 'vault.pin';
/**
 * The inventory's label, reused here: the action is the same and the key is
 * already translated in every language (a `vault.*` twin would need all 30).
 */
export const REARRANGE_LABEL: TextKey = 'inventory.rearrange';

export const HEAD_CLOSE_X = 169;
export const HEAD_CLOSE_Y = 7;
export const HEAD_CLOSE_WIDTH = 13;
export const HEAD_CLOSE_HEIGHT = 12;

export const VAULT_SPRITES = [
  MONEY_SPRITE,
  DEPOSIT_SPRITE,
  WITHDRAW_SPRITE,
  UNLOCKED_SPRITE,
  LOCKED_SPRITE,
  REARRANGE_SPRITE,
];
