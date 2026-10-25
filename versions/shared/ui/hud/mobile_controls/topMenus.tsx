import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { t } from '@/i18n';
import { MuHelper } from '@/modules/mu_helper';
import { moduleOn } from '@/modules/module';
import { MuHelperState, toggleMuHelperWindow } from '@/modules/mu_helper/state';
import { MobileButton, ScaledFrame } from './mobileButton';
import { MenuCluster } from './menuCluster';
import { HELPER_ICON } from './consts';

/**
 * The two circular gold buttons at the top right of a phone, in the MU Helper's
 * own dark red. The left one, three gold bars, unfolds the five main-frame
 * buttons (`MenuCluster`); the right one, the macro system's gold wrench,
 * unfolds the helper's play/stop and settings icons, which on a desktop sit
 * against the minimap - a phone has no room there, and the touch cluster would
 * sit on top of them.
 *
 * One panel at a time, and the row keeps the art small: the buttons are
 * `clamp()`ed in the stylesheet and the cluster scales to the screen.
 */
export const TopMenus = observer(() => {
  const [open, setOpen] = useState<'icons' | 'helper' | null>(null);
  // Same gate as the desktop plates (`mu_helper_buttons`' `module`).
  const helper = moduleOn('mu_helper');
  // The plate stays lit while the helper's window is up, however it was opened.
  const helperLit = open === 'helper' || MuHelperState.windowOpen;
  const toggle = (panel: 'icons' | 'helper') =>
    setOpen(current => (current === panel ? null : panel));

  return (
    <div className="mobile-top-menus">
      <div className="mobile-hamburgers">
        <MobileButton
          className={`mobile-hamburger${open === 'icons' ? ' open' : ''}`}
          title={t('bottomBar.menu')}
          onTap={() => toggle('icons')}
        >
          {() => BARS}
        </MobileButton>
        {helper && (
          <MobileButton
            className={`mobile-hamburger helper${helperLit ? ' open' : ''}${
              MuHelper.active ? ' running' : ''
            }`}
            title={t('muHelperButtons.settings')}
            onTap={() => toggle('helper')}
          >
            {pressed => (
              <ScaledFrame
                file={HELPER_ICON.sprite}
                y={pressed ? HELPER_ICON.dim : HELPER_ICON.lit}
                width={HELPER_ICON.width}
                height={HELPER_ICON.height}
                scale={HELPER_ICON.scale}
              />
            )}
          </MobileButton>
        )}
      </div>

      {open === 'icons' && <MenuCluster docked />}

      {open === 'helper' && helper && (
        <div className="mobile-helper-panel">
          <MobileButton
            className={`mobile-helper-plate${MuHelper.active ? ' running' : ''}`}
            title={t(MuHelper.active ? 'muHelperButtons.stop' : 'muHelperButtons.start')}
            onTap={() => MuHelper.toggleMuHelper()}
          >
            {() => (MuHelper.active ? STOP_ICON : PLAY_ICON)}
          </MobileButton>
          <MobileButton
            className="mobile-helper-plate"
            title={t('muHelperButtons.settings')}
            onTap={() => {
              toggleMuHelperWindow();
              setOpen(null);
            }}
          >
            {() => SETTINGS_ICON}
          </MobileButton>
        </div>
      )}
    </div>
  );
});

/** The three gold bars; the same glyph on both plates. */
const BARS = (
  <span className="mobile-hamburger-bars" aria-hidden="true">
    <span />
    <span />
    <span />
  </span>
);

const PLAY_ICON = (
  <svg className="mobile-helper-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 5.5 18 12 8 18.5Z" fill="currentColor" />
  </svg>
);

const STOP_ICON = (
  <svg className="mobile-helper-icon" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" />
  </svg>
);

const SETTINGS_ICON = (
  <svg
    className="mobile-helper-icon"
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
