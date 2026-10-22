import './style.less';
import { observer } from 'mobx-react-lite';
import { GameOptions, improvementOnChoice, uiScaleFactor } from '@/controllers/settings';
import { uiClick } from '@/controllers/sound/sfx';
import { Ecs } from '@/ecs/current';
import { MuHelper } from '@/modules/mu_helper';
import { toggleMuHelperWindow } from '@/modules/mu_helper/state';
import { t } from '@/i18n';
import { MINIMAP_SLOT_TOP } from '../../windows/events/layout';
import { cornerPanelSize, cornerPanelSpan } from '../minimap/corner';

/** Between the two buttons and between the column and the minimap, in interface units. */
const GAP = 6;

/** One square button's edge: half the minimap, so the pair stacks as tall as it. */
function buttonSize(): number {
  return (cornerPanelSize() - GAP * uiScaleFactor(GameOptions.uiScale)) / 2;
}

/**
 * The column's width plus its gap to the minimap, in screen pixels (0 while the
 * improvement is off): the HUD pieces left of the minimap step past the buttons.
 */
export function helperButtonsSpan(): number {
  return improvementOnChoice('muHelperButtons')
    ? buttonSize() + GAP * uiScaleFactor(GameOptions.uiScale)
    : 0;
}

/**
 * Ours (`muHelperButtons`): the Home and End keys as square buttons, stacked against the
 * left side of the corner minimap and exactly as tall as it. Draws nothing on Classic.
 */
export const MuHelperButtons = observer(() => {
  // `improvementOnChoice`, not `isOn`: it reads the observable choice, so flipping
  // the checkbox in Options shows or hides the buttons at once.
  if (!improvementOnChoice('muHelperButtons') || !Ecs.world?.playerEntity) return null;

  const ui = uiScaleFactor(GameOptions.uiScale);
  const size = buttonSize();
  const gap = GAP * ui;

  return (
    <div
      className="mu-helper-buttons"
      style={{
        position: 'absolute',
        top: MINIMAP_SLOT_TOP,
        // Immediately left of the corner panel (`cornerPanelSpan` already has its 10 px margin).
        right: cornerPanelSpan() + gap,
        width: size,
        height: cornerPanelSize(),
        display: 'flex',
        flexDirection: 'column',
        gap,
        pointerEvents: 'auto',
        zIndex: 10,
      }}
    >
      <button
        type="button"
        className="mu-helper-button"
        style={{
          fontSize: 11 * ui,
          color: MuHelper.active ? '#7CFC7C' : '#FFD700',
        }}
        onClick={uiClick(() => MuHelper.toggleMuHelper())}
      >
        {t(MuHelper.active ? 'muHelperButtons.stop' : 'muHelperButtons.start')}
      </button>
      <button
        type="button"
        className="mu-helper-button"
        style={{ fontSize: 11 * ui }}
        onClick={uiClick(() => toggleMuHelperWindow())}
      >
        {t('muHelperButtons.settings')}
      </button>
    </div>
  );
});
