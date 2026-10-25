import './style.less';
import { observer } from 'mobx-react-lite';
import { GameOptions, improvementOnChoice, uiScaleFactor } from '@/controllers/settings';
import { useIsMobile } from '@/controllers/interface/mobile';
import { uiClick } from '@/controllers/sound/sfx';
import { Ecs } from '@/ecs/current';
import { MuHelper } from '@/modules/mu_helper';
import { toggleMuHelperWindow } from '@/modules/mu_helper/state';
import { t } from '@/i18n';
import { MINIMAP_SLOT_TOP } from '../../windows/events/layout';
import { cornerPanelSize, cornerPanelSpan } from '../minimap/corner';

/** Between the two buttons and between the column and the minimap, in interface units. */
const GAP = 6;

const PLAY_ICON = (
  <svg className="mu-helper-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 5.5 18 12 8 18.5Z" fill="currentColor" />
  </svg>
);

const STOP_ICON = (
  <svg className="mu-helper-icon" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" />
  </svg>
);

const SETTINGS_ICON = (
  <svg
    className="mu-helper-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" />
  </svg>
);

/** One circular button's diameter: half the minimap, so the pair stacks as tall as it. */
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
 * Ours (`muHelperButtons`): start/stop and settings as circular gold buttons,
 * stacked against the left side of the corner minimap and exactly as tall as
 * it. Draws nothing on Classic, and nothing on a phone: there is no minimap
 * corner to hang them on, and the touch HUD carries the same two actions behind
 * its top-right hamburger (`mobile_controls/topMenus.tsx`).
 */
export const MuHelperButtons = observer(() => {
  const mobile = useIsMobile();
  // `improvementOnChoice`, not `isOn`: it reads the observable choice, so flipping
  // the checkbox in Options shows or hides the buttons at once.
  if (mobile || !improvementOnChoice('muHelperButtons') || !Ecs.world?.playerEntity) return null;

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
        style={{ color: MuHelper.active ? '#7CFC7C' : '#FFD700' }}
        aria-label={t(MuHelper.active ? 'muHelperButtons.stop' : 'muHelperButtons.start')}
        title={t(MuHelper.active ? 'muHelperButtons.stop' : 'muHelperButtons.start')}
        onClick={uiClick(() => MuHelper.toggleMuHelper())}
      >
        {MuHelper.active ? STOP_ICON : PLAY_ICON}
      </button>
      <button
        type="button"
        className="mu-helper-button"
        aria-label={t('muHelperButtons.settings')}
        title={t('muHelperButtons.settings')}
        onClick={uiClick(() => toggleMuHelperWindow())}
      >
        {SETTINGS_ICON}
      </button>
    </div>
  );
});
