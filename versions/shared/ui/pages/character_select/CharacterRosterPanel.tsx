import { t } from '@/i18n';
import { CharacterClassNumber } from '@/core/types';
import { classFromAppearance } from '@/controllers/actors/deserializeAppearance';
import { getClassName } from '@/modules/hero/characterStats';
import {
  MAX_CHARACTERS,
  type ListedCharacter,
} from './character_list/roster';

/**
 * The account's five slots on the right of the character screen. The 3D
 * line-up still draws the heroes; this panel is the same roster as cards, so
 * an empty slot is visible and can start creation without hunting for the
 * bottom-left button.
 */

const BADGE: Partial<Record<CharacterClassNumber, string>> = {
  [CharacterClassNumber.DarkWizard]: 'DW',
  [CharacterClassNumber.SoulMaster]: 'SM',
  [CharacterClassNumber.GrandMaster]: 'GM',
  [CharacterClassNumber.DarkKnight]: 'DK',
  [CharacterClassNumber.BladeKnight]: 'BK',
  [CharacterClassNumber.BladeMaster]: 'BM',
  [CharacterClassNumber.FairyElf]: 'FE',
  [CharacterClassNumber.MuseElf]: 'ME',
  [CharacterClassNumber.HighElf]: 'HE',
  [CharacterClassNumber.MagicGladiator]: 'MG',
  [CharacterClassNumber.DuelMaster]: 'DM',
  [CharacterClassNumber.DarkLord]: 'DL',
  [CharacterClassNumber.LordEmperor]: 'LE',
  [CharacterClassNumber.Summoner]: 'SU',
  [CharacterClassNumber.BloodySummoner]: 'BS',
  [CharacterClassNumber.DimensionMaster]: 'DM',
  [CharacterClassNumber.RageFighter]: 'RF',
  [CharacterClassNumber.FistMaster]: 'FM',
};

type CharacterRosterPanelProps = {
  characters: readonly ListedCharacter[];
  focused: string;
  canCreate: boolean;
  onFocus: (name: string) => void;
  onPlay: (name: string) => void;
  onCreate: () => void;
};

function slotsOf(
  characters: readonly ListedCharacter[]
): (ListedCharacter | undefined)[] {
  const slots: (ListedCharacter | undefined)[] = new Array(MAX_CHARACTERS).fill(
    undefined
  );

  characters.forEach((character, index) => {
    const slot = character.SlotIndex ?? index;
    if (slot >= 0 && slot < MAX_CHARACTERS) slots[slot] = character;
  });

  return slots;
}

export const CharacterRosterPanel = ({
  characters,
  focused,
  canCreate,
  onFocus,
  onPlay,
  onCreate,
}: CharacterRosterPanelProps) => {
  const slots = slotsOf(characters);

  return (
    <div className="char-roster-panel" role="list" aria-label={t('characters.chooseHero')}>
      {slots.map((character, index) => {
        if (!character) {
          return (
            <button
              key={`empty-${index}`}
              type="button"
              role="listitem"
              className="char-roster-card is-empty"
              disabled={!canCreate}
              onClick={onCreate}
            >
              <span className="char-roster-badge is-empty" aria-hidden="true">
                +
              </span>
              <span className="char-roster-main">
                <span className="char-roster-name">{t('characters.emptySlot')}</span>
                <span className="char-roster-class">
                  {t('characters.createCharacter')}
                </span>
              </span>
            </button>
          );
        }

        const cls = classFromAppearance(character.Appearance);
        const selected = character.Name === focused;

        return (
          <button
            key={character.Name}
            type="button"
            role="listitem"
            className={`char-roster-card${selected ? ' is-selected' : ''}`}
            aria-pressed={selected}
            onClick={() => onFocus(character.Name)}
            onDoubleClick={() => onPlay(character.Name)}
          >
            <span className="char-roster-badge" aria-hidden="true">
              {BADGE[cls] ?? getClassName(cls).slice(0, 2).toUpperCase()}
            </span>
            <span className="char-roster-main">
              <span className="char-roster-name">{character.Name}</span>
              <span className="char-roster-class">{getClassName(cls)}</span>
            </span>
            <span className="char-roster-level">
              <small>{t('characters.levelShort')}</small>
              {character.Level}
            </span>
          </button>
        );
      })}
    </div>
  );
};
