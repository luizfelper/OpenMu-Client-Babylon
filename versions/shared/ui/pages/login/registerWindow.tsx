import { MuWindows } from '@/controllers/interface/windowManager';
import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { t } from '@/i18n';
import { MsgBox } from '@/controllers/interface';
import { playUiSound } from '@/controllers/sound/sfx';
import { registerApiUrl } from '@/modules/servers/serverServices';
import {
  MAX_ACCOUNT_LENGTH,
  MAX_ACCOUNT_PASSWORD_LENGTH,
  MIN_ACCOUNT_LENGTH,
  MIN_ACCOUNT_PASSWORD_LENGTH,
  validateSignup,
  type SignupProblem,
} from '@/modules/servers/registerRules';


/**
 * Account creation, in the login window's place.
 *
 * The same `login_back.OZT` frame, because a signup form is the login form
 * with one more row - and because swapping one window for another leaves the
 * logo, the scene and the music exactly where they were. That is the whole
 * point of it being here rather than on a page of its own: the player never
 * leaves the screen they waited for.
 *
 * Everything is absolutely positioned against the art, as the rest of MU's UI
 * is, and must never reflow.
 */

const WIN_WIDTH = 329;
const WIN_HEIGHT = 245;

const INPUT_X = 110;
const LABEL_X = 30;

/**
 * The same box as the login window, with one more row. The title bar is the
 * shared `.login-title`, so the form starts below it and the buttons take the
 * bottom band exactly as they do on the login window.
 */
const FIRST_ROW_Y = 88;
const ROW_STEP = 26;

/** The label sits a few px below the input's top edge to look centred. */
const LABEL_OFFSET_Y = 8;

const BUTTON_Y = 196;
const OK_X = 167;
const CANCEL_X = 237;

const ROWS = [
  { key: 'username', label: 'register.id', type: 'text' },
  { key: 'password', label: 'register.password', type: 'password' },
  { key: 'confirm', label: 'register.confirm', type: 'password' },
] as const;

type Field = (typeof ROWS)[number]['key'];

const EMPTY: Record<Field, string> = {
  username: '',
  password: '',
  confirm: '',
};

const MAX_LENGTH: Record<Field, number> = {
  username: MAX_ACCOUNT_LENGTH,
  password: MAX_ACCOUNT_PASSWORD_LENGTH,
  confirm: MAX_ACCOUNT_PASSWORD_LENGTH,
};

/** The shared rules' reasons, said in the player's language. */
function problemText(problem: SignupProblem): string {
  switch (problem) {
    case 'empty':
      return t('register.fillEveryField');
    case 'idShort':
      return t('register.idTooShort', { min: MIN_ACCOUNT_LENGTH });
    case 'idChars':
      return t('register.idChars');
    case 'passwordShort':
      return t('register.passwordTooShort', {
        min: MIN_ACCOUNT_PASSWORD_LENGTH,
      });
    case 'passwordChars':
      return t('register.passwordChars');
    case 'mismatch':
      return t('register.mismatch');
  }
}

type RegisterWindowProps = {
  /** The account exists; the login window takes it from here. */
  onCreated: (username: string) => void;
  onCancel: () => void;
};

// `observer` for the language selector: every label here is a `t()`, and the
// login page's own render does not read one while this window is up.
export const RegisterWindow = observer(({ onCreated, onCancel }: RegisterWindowProps) => {
  const [values, setValues] = useState<Record<Field, string>>(EMPTY);
  const [error, setError] = useState<string>('');
  const [sending, setSending] = useState(false);

  const set = (field: Field, value: string) =>
    setValues(current => ({ ...current, [field]: value }));

  const submit = async () => {
    if (sending) return;

    const problem = validateSignup(values);

    if (problem) {
      setError(problemText(problem));
      return;
    }

    setError('');
    setSending(true);

    try {
      const response = await fetch(registerApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: values.username,
          password: values.password,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        // The service's own words: it is the one that knows the ID is taken or
        // that this network has had its account for today, and it says so in
        // English because it has no idea who is asking.
        setError(body.error || t('register.failed', { status: response.status }));
        setSending(false);
        return;
      }

      onCreated(values.username);
    } catch {
      // Offline, DNS, CORS - none of which the player can act on beyond
      // trying again.
      setError(t('register.unreachable'));
      setSending(false);
    }
  };

  const form = useRef<HTMLFormElement>(null);
  // The listener is registered once; the ref hands it the current pair.
  const keyState = useRef({ sending, onCancel });
  useEffect(() => {
    keyState.current = { sending, onCancel };
  });

  // The login window's keys (LoginWin.cpp:207-219) on this window's OK and
  // Cancel, wherever the focus is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      if (e.isComposing || e.keyCode === 229) return;
      if (MsgBox.msgWin || MuWindows.isOpen('options')) return;

      e.preventDefault();
      if (e.repeat) return;

      const { sending, onCancel } = keyState.current;
      if (e.key === 'Escape') {
        playUiSound('click');
        onCancel();
      } else if (!sending) {
        playUiSound('click');
        form.current?.requestSubmit();
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="login-win" style={{ width: WIN_WIDTH, height: WIN_HEIGHT }}>
      <div className="login-title">{t('login.createAccount')}</div>

      <form
        ref={form}
        onSubmit={e => {
          e.preventDefault();
          submit();
        }}
      >
        {ROWS.map((row, i) => {
          const top = FIRST_ROW_Y + i * ROW_STEP;

          return (
            <div key={row.key}>
              <span
                className="login-label"
                style={{ left: LABEL_X, top: top + LABEL_OFFSET_Y }}
              >
                {t(row.label)}
              </span>

              <input
                className="login-input"
                type={row.type}
                autoFocus={i === 0}
                autoComplete="off"
                value={values[row.key]}
                onChange={e => set(row.key, e.target.value)}
                maxLength={MAX_LENGTH[row.key]}
                style={{ left: INPUT_X, top }}
              />
            </div>
          );
        })}

        <button
          type="button"
          className="login-btn is-primary"
          disabled={sending}
          onClick={submit}
          style={{ left: OK_X, top: BUTTON_Y }}
        >
          {t('common.create')}
        </button>
        <button
          type="button"
          className="login-btn"
          onClick={onCancel}
          style={{ left: CANCEL_X, top: BUTTON_Y }}
        >
          {t('common.cancel')}
        </button>

        <button type="submit" className="login-submit" tabIndex={-1} />
      </form>

      {!!error && <p className="login-signup-message">{error}</p>}
    </div>
  );
});
