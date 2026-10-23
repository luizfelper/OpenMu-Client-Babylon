import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { EN_TEXT, i18n, t, type TextKey } from './index';

/**
 * Pins what `t(key)` returns for every key in every language, switching the
 * language through the engine, plus each language's selector metadata. Moving
 * text between files must leave every hash as it is.
 */

const KEYS = (Object.keys(EN_TEXT) as TextKey[]).sort();

function languageHash(code: string): string {
  i18n.setLanguage(code);
  expect(i18n.language).toBe(code);

  const layer = i18n.current;
  const pack = layer.dataPack;
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify([
      layer.name, layer.code, layer.aliases ?? [], layer.label, layer.region, layer.font ?? '',
      pack ? [pack.folder, pack.suffix, pack.encoding ?? '', !!pack.repairs, !!pack.itemNames, !!pack.dialogPages] : null,
    ])
  );
  for (const key of KEYS) hash.update(`${key}\t${t(key)}\t${i18n.translated(key)}\n`);
  return hash.digest('hex').slice(0, 16);
}

describe('text golden', () => {
  it('every key reads the same line in every language', () => {
    const was = i18n.language;
    const hashes = Object.fromEntries(i18n.languages.map(l => [l.code, languageHash(l.code)]));
    i18n.setLanguage(was);

    expect(KEYS.length).toBe(2656);
    expect(hashes).toEqual({
      en: 'f40d6288d8b8823a',
      bg: '0639d6d07f8f0299',
      zh: '7593a7d6e5b0fbcf',
      fr: '504a4fa072b29d29',
      de: '113c9990ea589de4',
      it: '9a4fd6cef3d8093b',
      ja: '5b26f0e097181bf7',
      ko: '3f31781e048c33ad',
      pl: '0d0f2d8f72dd5502',
      pt: 'dff94e327861f2c3',
      ro: '7c05dd1d3aecbb5c',
      ru: 'a5702282daf77360',
      es: '84ef3730d7181983',
      th: '6b7db8564d0e984a',
      vi: '22e4cbe61d82d5c5',
      ar: 'fe113ac032d9cd54',
      bn: '6589a50b62ca3e76',
      ca: '913f5adf62ab13e9',
      cs: '899dcf0ce895c62e',
      el: '59088a2f7051e668',
      eu: 'd4de84e4ab187dec',
      fa: '319ba24097152e01',
      fil: '649a32bdacd8a4a0',
      hi: 'e45af66ace55467e',
      hu: 'ac348a56b2d5880f',
      id: '38781ee73640940c',
      'sr-Latn': 'b954676583b2cc46',
      tr: 'd1d8a9fcfaefc695',
      uk: '74138fb666143662',
      ur: '6fe4ec07c281e1ca',
      'zh-Hant': '89e4c490d0be420a',
    });
  });
});
