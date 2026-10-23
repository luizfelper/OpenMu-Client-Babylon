import { useEffect } from 'react';
import { t } from '@/i18n';
import { MuSpriteFrame } from '@/controllers/interface/components/mu_sprite';
import { MuButton } from '@/controllers/interface/components/mu_button';
import { WINDOW_Z_MODAL } from '@/controllers/interface/windowManager';
import {
  BACK_SPRITE,
  BTN_BOTH_CANCEL_X,
  BTN_BOTH_OK_X,
  BTN_HEIGHT,
  BTN_SINGLE_X,
  BTN_WIDTH,
  BTN_Y,
  OK_SPRITE,
  WIN_HEIGHT,
  WIN_WIDTH,
} from '@/controllers/interface/components/msg_window';

/**
 * Enter and Escape answer the box, in the capture phase so the window stack
 * never sees that Escape and closes the options behind it.
 */
function useAnswerKeys(answer: (yes: boolean) => void): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      answer(e.key === 'Enter');
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [answer]);
}

const button = (label: string, left: number, onClick: () => void) => (
  <MuButton
    file={OK_SPRITE}
    width={BTN_WIDTH}
    height={BTN_HEIGHT}
    frames={{ up: 0, active: 1, down: 2 }}
    className="mucura-options-button"
    color="#e6d6b4"
    activeColor="#f1d99a"
    label={label}
    onClick={onClick}
    style={{ position: 'absolute', left, top: BTN_Y }}
  />
);

/** `CMsgWin` over the option window: a question, OK and Cancel. */
export const ConfirmBox = ({
  text,
  onAnswer,
}: {
  text: string;
  onAnswer: (yes: boolean) => void;
}) => {
  useAnswerKeys(onAnswer);

  return (
    <div className="options-exit-confirm" style={{ zIndex: WINDOW_Z_MODAL }}>
      <MuSpriteFrame
        file={BACK_SPRITE}
        className="mucura-confirm-frame"
        width={WIN_WIDTH}
        height={WIN_HEIGHT}
      >
        <div className="options-exit-text">{text}</div>
        {button(t('common.ok'), BTN_BOTH_OK_X, () => onAnswer(true))}
        {button(t('common.cancel'), BTN_BOTH_CANCEL_X, () => onAnswer(false))}
      </MuSpriteFrame>
    </div>
  );
};

/** The same box with one button: something said, nothing asked. */
export const NoticeBox = ({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) => {
  useAnswerKeys(onClose);

  return (
    <div className="options-exit-confirm" style={{ zIndex: WINDOW_Z_MODAL }}>
      <MuSpriteFrame
        file={BACK_SPRITE}
        className="mucura-confirm-frame"
        width={WIN_WIDTH}
        height={WIN_HEIGHT}
      >
        <div className="options-exit-text">{text}</div>
        {button(t('common.ok'), BTN_SINGLE_X, onClose)}
      </MuSpriteFrame>
    </div>
  );
};
