/**
 * Geometry for the mobile HUD, in screen pixels rather than the 640x480 UI
 * stage: these are thumb targets, not reproductions of the original's art, so
 * they must not shrink with the stage on a small screen.
 */

/** `IMAGE_SKILLBOX` / `IMAGE_SKILLBOX_USE`: the empty box and its lit copy. */
export const SKILLBOX_SPRITE = 'newui_skillbox.OZJ';
export const SKILLBOX_USE_SPRITE = 'newui_skillbox2.OZJ';

/** The skill box's own size on the sheet. */
export const BOX_WIDTH = 32;
export const BOX_HEIGHT = 38;

/** Boxes are drawn at 51x61 - comfortably past the ~44 px a thumb needs. */
export const SLOT_SCALE = 1.6;

/** The five main-frame buttons (30x41) at 42x57. */
export const MENU_SCALE = 1.4;

/** The docked row behind the hamburger: same buttons, no bigger than 36x49. */
export const DOCKED_MAX_SCALE = 1.2;

/** Between the docked buttons, in screen pixels (the stylesheet's `gap`). */
export const DOCKED_GAP = 6;

/**
 * The MU Helper hamburger's glyph: the macro system's wrench (`MacroUI_Setup.OZT`),
 * 18x13 frames stacked every 13 px (normal, lit, dim). Drawn at 27x20 inside the plate.
 */
export const HELPER_ICON = {
  sprite: 'MacroUI/MacroUI_Setup.OZT',
  width: 18,
  height: 13,
  scale: 1.5,
  lit: 13,
  dim: 26,
} as const;
