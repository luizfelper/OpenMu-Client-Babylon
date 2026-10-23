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
 * The two hamburgers at the top right of a phone, in the MU Helper's own plate
 * (dark translucent red, gold trim). The left one, three gold bars, unfolds the
 * five main-frame buttons (`MenuCluster`); the right one, the macro system's
 * gold wrench, unfolds the helper's pair of plates, which on a desktop sit
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
            onTap={() => MuHelper.toggleMuHelper()}
          >
            {() => t(MuHelper.active ? 'muHelperButtons.stop' : 'muHelperButtons.start')}
          </MobileButton>
          <MobileButton
            className="mobile-helper-plate"
            onTap={() => {
              toggleMuHelperWindow();
              setOpen(null);
            }}
          >
            {() => t('muHelperButtons.settings')}
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
