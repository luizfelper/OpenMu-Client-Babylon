import { MuWindows } from '@/controllers/interface/windowManager';
import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
import { playUiSound, uiClick } from '@/controllers/sound/sfx';
import './style.less';
import { observer } from 'mobx-react-lite';
import { Servers } from '@/modules/servers';
import { Session } from '@/modules/session';
import { MsgBox } from '@/controllers/interface';
import { MAX_PASSWORD_LENGTH, MAX_USERNAME_LENGTH } from '@/modules/servers/serverAccounts';
import { registerApiUrl, registerUrl } from '@/modules/servers/serverServices';
import { MuLogo } from '@/controllers/interface/components/mu_logo';
import { RegisterWindow } from './registerWindow';

const WIN_WIDTH = 329;
const WIN_HEIGHT = 245;

const INPUT_X = 110;
const ACCOUNT_Y = 86;
const PASSWORD_Y = 116;

const BUTTON_Y = 178;
const OK_X = 167;
const CANCEL_X = 237;

const CHECK_X = 110;
const CHECK_Y = 148;

const LABEL_X = 30;

/** Centred under the buttons, in the empty band the old dragons used to fill. */
const REGISTER = { x: 0, y: 224 };

/** `CLoginWin::Render`: the server line, now centred under the title bar. */
const SERVER_LINE = { x: 0, y: 58 };

const onCancelClicked = () => Session.cancelLogin();

export const LoginPage = observer(() => {
  const [registering, setRegistering] = useState(false);
  /** "Account created" - shown where the login error would be, in green. */
  const [notice, setNotice] = useState('');

  // The world being logged into, not the build: a client plays any world, and
  // each one has its own signup service.
  const signupApi = registerApiUrl();
  // Only for a build that named a page but no endpoint. Then this window
  // cannot create the account itself and links out, as it always did.
  const signupPage = signupApi ? '' : registerUrl();

  const openRegister = () => {
    setNotice('');
    Session.loginError = undefined;
    setRegistering(true);
  };

  const onLoginClicked = () => {
    if (Session.loginProcessing) return;

    setNotice('');

    if (!Session.canSubmitLogin) {
      Session.loginError = t('login.enterCredentials');
      return;
    }

    Session.loginError = undefined;
    Session.loginProcessing = true;

    Session.submitLogin();
  };

  const form = useRef<HTMLFormElement>(null);

  // Enter and Escape are OK and Cancel wherever the focus is, click included
  // (LoginWin.cpp:207-219): a click on the checkbox or the art leaves it on
  // the body, outside the form.
  useEffect(() => {
    if (registering) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      if (e.isComposing || e.keyCode === 229) return;
      if (MsgBox.msgWin || MuWindows.isOpen('options')) return;
      // A focused link keeps its own Enter.
      if (e.target instanceof HTMLAnchorElement) return;

      // Also stops the form's implicit submit, which would log in twice.
      e.preventDefault();
      // Once per press (CInput::IsKeyDown), not once per auto-repeat.
      if (e.repeat) return;

      if (e.key === 'Escape') {
        playUiSound('click');
        onCancelClicked();
      } else if (!Session.loginProcessing) {
        playUiSound('click');
        // Through the form, so a password manager still sees a login submitted.
        form.current?.requestSubmit();
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [registering]);

  // One window swapped for another: the logo, the scene behind it and the
  // music are outside this and never notice.
  if (registering) {
    return (
      <div className="login-page">
        <MuLogo />

        <RegisterWindow
          onCreated={username => {
            Session.username = username;
            Session.password = '';
            Session.loginError = undefined;
            setNotice(t('register.created'));
            setRegistering(false);
          }}
          onCancel={() => setRegistering(false)}
        />
      </div>
    );
  }

  return (
    <div className="login-page">
      <MuLogo />

      <div className="login-win" style={{ width: WIN_WIDTH, height: WIN_HEIGHT }}>
        <div className="login-title">{t('login.title')}</div>

        {/* GlobalText 460: "%s Server %d" - the server picked on the list. */}
        {Servers.selectedServer && (
          <span
            className="login-server-line"
            style={{ left: SERVER_LINE.x, top: SERVER_LINE.y }}
          >
            {Servers.selectedServer.channelName
              ? `${Servers.selectedServer.name} - ${Servers.selectedServer.channelName}`
              : `${Servers.selectedServer.name} Ch. ${Servers.selectedServer.channel}`}
          </span>
        )}

        <form
          ref={form}
          onSubmit={e => {
            e.preventDefault();
            onLoginClicked();
          }}
        >
          <span className="login-label" style={{ left: LABEL_X, top: 92 }}>
            {t('login.id')}
          </span>
          <span className="login-label" style={{ left: LABEL_X, top: 122 }}>
            {t('login.password')}
          </span>

          {/* An ID is already there after a signup, or after "remember me":
              the field still to fill is the password. */}
          <input
            className="login-input"
            type="text"
            autoFocus={!Session.username}
            spellCheck={false}
            value={Session.username}
            onChange={e => {
              Session.username = e.target.value;
            }}
            maxLength={MAX_USERNAME_LENGTH}
            style={{ left: INPUT_X, top: ACCOUNT_Y }}
          />

          {/* Empty with a saved login: OK sends the login token instead (improvement loginTokens). */}
          <input
            className="login-input"
            type="password"
            autoFocus={!!Session.username}
            placeholder={Session.savedToken ? t('login.savedLogin') : undefined}
            value={Session.password}
            onChange={e => {
              Session.password = e.target.value;
            }}
            maxLength={MAX_PASSWORD_LENGTH}
            style={{ left: INPUT_X, top: PASSWORD_Y }}
          />

          <label
            className="login-remember"
            style={{ left: CHECK_X, top: CHECK_Y }}
          >
            <input
              type="checkbox"
              checked={Session.rememberLogin}
              onChange={uiClick(() => (Session.rememberLogin = !Session.rememberLogin))}
            />
            <span className="login-check" aria-hidden="true" />
            <span className="login-remember-text">{t('login.rememberMe')}</span>
          </label>

          <button
            type="button"
            className="login-btn is-primary"
            disabled={Session.loginProcessing}
            onClick={onLoginClicked}
            style={{ left: OK_X, top: BUTTON_Y }}
          >
            {t('login.title')}
          </button>
          <button
            type="button"
            className="login-btn"
            onClick={onCancelClicked}
            style={{ left: CANCEL_X, top: BUTTON_Y }}
          >
            {t('login.clear')}
          </button>

          {/* Swaps this window for the register one. Nothing navigates: the
              scene behind stays where it is, which is the point. */}
          {!!signupApi && (
            <span
              className="login-register"
              style={{ top: REGISTER.y }}
              onClick={uiClick(openRegister)}
            >
              {t('login.createAccount')}
            </span>
          )}

          {/* A build that knows a signup page but no endpoint. A new tab, not
              this one: leaving would cost the scene the player waited for. */}
          {!!signupPage && (
            <a
              className="login-register"
              href={signupPage}
              target="_blank"
              rel="noopener noreferrer"
              style={{ top: REGISTER.y }}
              onClick={uiClick()}
            >
              {t('login.createAccount')}
            </a>
          )}

          <button type="submit" className="login-submit" tabIndex={-1} />
        </form>

        {!!Session.loginError && (
          <p className="login-error">{Session.loginError}</p>
        )}

        {!Session.loginError && !!notice && <p className="login-notice">{notice}</p>}
      </div>
    </div>
  );
});
