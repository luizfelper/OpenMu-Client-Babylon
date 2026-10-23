import { MuWindows } from '@/controllers/interface/windowManager';
import { t } from '@/i18n';
import './style.less';
import { reaction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState } from 'react';
import { MsgBox, MsgWinCode } from '@/controllers/interface';
import { confirmDeleteCharacter, CharSelect } from '@/modules/character_select';
import { characterSelectView } from '@/modules/character_select/characterSelect';
import { useEventBus } from '@/controllers/interface/hooks';
import { playUiSound } from '@/controllers/sound/sfx';
import { isTypingInField, PREGAME_MENU } from '@/ecs/systems/keyboardInputSystem';
import { GuildMemberRoleEnum } from '@versions/shared/packets/ServerToClientPackets';
import { MsgWindow } from '@/controllers/interface/components/msg_window';

import { CharMakeWin } from './CharMakeWin';
import { CharacterRosterPanel } from './CharacterRosterPanel';
import {
  CharacterList,
  hasFreeSlot,
  listStatus,
  selectedCharacter,
  type ListedCharacter,
} from './character_list';
import { MAX_CHARACTERS } from './character_list/roster';

const CTLCODE_02BLOCKITEM = 0x02;

function isDeleteBlocked(character: ListedCharacter): boolean {
  return (
    !!character.IsItemBlockActive ||
    (character.Status & CTLCODE_02BLOCKITEM) !== 0
  );
}

const MenuIcon = () => (
  <svg className="char-action-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

const PlusIcon = () => (
  <svg className="char-action-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const PlayIcon = () => (
  <svg className="char-action-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none" />
  </svg>
);

const TrashIcon = () => (
  <svg className="char-action-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
  </svg>
);

export const CharactersPage = observer(() => {
  const [creating, setCreating] = useState(false);
  // From the request until the world replaces this screen: a second
  // SelectCharacter finds OpenMU past CharacterSelection and it drops the
  // connection (SelectCharacterAction.cs:20-24). The original leaves for the
  // loading scene at once (CharacterScene.cpp:80).
  const [selecting, setSelecting] = useState(false);

  useEventBus('CharacterCreationSuccessful', () => setCreating(false));

  const selected = selectedCharacter(CharSelect.charactersList, CharSelect.focusedChar);
  const status = listStatus(
    {
      loading: CharSelect.loadingCharactersList,
      count: CharSelect.charactersList.length,
      selected: !!selected,
    },
    'pick'
  );

  const connect = (name: string) => {
    if (selecting) return;
    playUiSound('click');
    setSelecting(true);
    CharSelect.selectCharacterRequest(name);
  };

  const onConnect = () => {
    if (!selected) return;
    connect(selected.Name);
  };

  const onFocusCharacter = (name: string) => {
    playUiSound('click');
    CharSelect.focusedChar = name;
    CharSelect.focusCharacterRequest(name);
  };

  // Enter is the Connect button while nothing else is up
  // (CharacterScene.cpp:193-207); the create window keeps its own Enter.
  // A double click on the focused character connects too, with no click (:214-223).
  const onEnter = (click = true) => {
    if (creating || selecting || MuWindows.isOpen('options') || MuWindows.isOpen(PREGAME_MENU) || !selected) return;
    if (click) playUiSound('click'); // CharacterScene.cpp:199
    onConnect();
  };
  const enterAction = useRef(onEnter);
  useEffect(() => {
    enterAction.current = onEnter;
  });
  useEffect(
    () =>
      reaction(
        () => characterSelectView.connectRequests,
        () => {
          if (!MsgBox.msgWin) enterAction.current(false);
        }
      ),
    []
  );

  // Its own keydown, not the keyPressed broadcast: that one takes the first
  // repeat of an Enter pressed in a field or a message box for a new press, so
  // an Enter held through the login would start a character. Document bubble
  // runs before the message box's own window listener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return;
      if (e.isComposing || e.keyCode === 229) return;
      if (MsgBox.msgWin) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        isTypingInField()
      ) {
        return;
      }
      enterAction.current();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onDelete = () => {
    if (!selected) return;

    if (selected.GuildPosition !== GuildMemberRoleEnum.Undefined) {
      MsgBox.popUpMsgWin(MsgWinCode.DeleteCharacterGuildWarning);
      return;
    }

    if (isDeleteBlocked(selected)) {
      MsgBox.popUpMsgWin(MsgWinCode.DeleteCharacterIdBlock);
      return;
    }

    confirmDeleteCharacter(selected.Name);
  };

  const hint =
    status === 'loading'
      ? t('characters.loading')
      : status === 'select'
        ? t('characters.select')
        : t('characters.playHint');

  return (
    <div className="characters-page">
      <CharacterList source={CharSelect} look="lineup" onList={() => setSelecting(false)} />

      <div className="char-sel-heading">
        <h1>{t('characters.chooseHero')}</h1>
        <p>
          {t('characters.slotCount', {
            count: CharSelect.charactersList.length,
            total: MAX_CHARACTERS,
          })}
        </p>
      </div>

      <CharacterRosterPanel
        characters={CharSelect.charactersList}
        focused={CharSelect.focusedChar}
        canCreate={hasFreeSlot(CharSelect.charactersList)}
        onFocus={onFocusCharacter}
        onPlay={connect}
        onCreate={() => setCreating(value => !value)}
      />

      <div className="char-sel-bar">
        <div className="char-sel-actions">
          <button
            type="button"
            className="char-action"
            // `CSMW_BTN_MENU` shows `CSysMenuWin` (CharSelMainWin.cpp:227-230).
            onClick={() => MuWindows.setOpen(PREGAME_MENU, true)}
          >
            <MenuIcon />
            {t('characters.menu')}
          </button>

          <button
            type="button"
            className="char-action"
            disabled={!hasFreeSlot(CharSelect.charactersList)}
            onClick={() => setCreating(value => !value)}
          >
            <PlusIcon />
            {t('characters.create')}
          </button>

          <button
            type="button"
            className="char-action is-primary"
            disabled={!selected || selecting}
            onClick={onConnect}
          >
            <PlayIcon />
            {t('characters.play')}
          </button>

          <button
            type="button"
            className="char-action is-danger"
            disabled={!selected}
            onClick={onDelete}
          >
            <TrashIcon />
            {t('characters.delete')}
          </button>
        </div>

        <p className="char-sel-hint">{hint}</p>
      </div>

      <MsgWindow />

      {creating && <CharMakeWin onClose={() => setCreating(false)} />}
    </div>
  );
});
