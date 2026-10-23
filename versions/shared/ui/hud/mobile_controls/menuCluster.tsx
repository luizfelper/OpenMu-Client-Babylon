import { observer } from 'mobx-react-lite';
import { t } from '@/i18n';
import { useUiViewport } from '@/controllers/interface/components/ui_stage';
import {
  MAIN_FRAME_BUTTONS,
  MAIN_FRAME_BUTTON_FRAMES,
  MAIN_FRAME_BUTTON_HEIGHT,
  MAIN_FRAME_BUTTON_WIDTH,
} from '../bottom_bar/mainFrameButtons';
import { MobileButton, ScaledFrame } from './mobileButton';
import { DOCKED_GAP, DOCKED_MAX_SCALE, MENU_SCALE } from './consts';

/**
 * Cash shop, character, inventory, friends, menu - the five the bar draws
 * at x 489..619 of a 640-wide frame, which on a 375 px screen is x 357..507:
 * off the right edge and unreachable. Same sprites, same actions, at a size a
 * thumb can hit (the window menu's System row is a phone's way to the system
 * menu). A column in portrait, a row in landscape, where there is width but
 * little height.
 *
 * On a phone the cluster lives behind the top-right hamburger, `docked`: a
 * compact row whose buttons shrink with the screen instead of a column half
 * the height of the glass.
 *
 * The bar keeps its own copies. They are fine where they are on screen (a
 * tablet held sideways) and dropping them would leave five holes in the art.
 */
export const MenuCluster = observer(({ docked = false }: { docked?: boolean }) => {
  // Rides the stage's own resize observer, so the cluster flips on rotate.
  const { width, height } = useUiViewport();
  const portrait = height >= width;
  const scale = docked ? dockedScale(width) : MENU_SCALE;

  return (
    <div
      className={`mobile-menu-cluster ${
        docked ? 'docked' : portrait ? 'portrait' : 'landscape'
      }`}
    >
      {MAIN_FRAME_BUTTONS.map(button => (
        <MobileButton
          key={button.file}
          className="mobile-menu-button"
          title={t(button.titleKey)}
          onTap={button.toggle}
        >
          {pressed => (
            <ScaledFrame
              file={button.file}
              y={
                (pressed || button.pressed() ? MAIN_FRAME_BUTTON_FRAMES.down : MAIN_FRAME_BUTTON_FRAMES.up) *
                MAIN_FRAME_BUTTON_HEIGHT
              }
              width={MAIN_FRAME_BUTTON_WIDTH}
              height={MAIN_FRAME_BUTTON_HEIGHT}
              scale={scale}
            />
          )}
        </MobileButton>
      ))}
    </div>
  );
});

/** Docked row: the five buttons and four 6 px gaps inside 92% of the width. */
function dockedScale(width: number): number {
  const room = (width * 0.92 - 4 * DOCKED_GAP) / (MAIN_FRAME_BUTTONS.length * MAIN_FRAME_BUTTON_WIDTH);
  return Math.max(1, Math.min(DOCKED_MAX_SCALE, room));
}
