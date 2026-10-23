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

    expect(KEYS.length).toBe(2657);
    expect(hashes).toEqual({
      en: '4afab0a236cb5b0d',
      bg: '889343a428305970',
      zh: '0fb6c8a288646774',
      fr: 'c8c165d4367d16dd',
      de: '54af678e0935c1c8',
      it: '79bf29596606923d',
      ja: '843ba4f5eb8b4bfa',
      ko: 'b37f7e50b0bb55be',
      pl: 'eea5400b64f216a1',
      pt: '7cedbc1990bcd2ac',
      ro: '73898600753bad30',
      ru: 'f6b4b5a25dab0ff4',
      es: 'ae78f9fee96f63a9',
      th: '3849acdfc020584c',
      vi: '87d8983c4844c46e',
      ar: 'ba504eeecd3d90c6',
      bn: '510176d4d34f35a1',
      ca: '879a0f417dba96de',
      cs: 'cb13d9950f63dd9d',
      el: '13aa9a5e82cafb4e',
      eu: 'b88ecde0faf3bfb6',
      fa: '0233ce72e6f2d006',
      fil: 'f95075d693582d25',
      hi: 'd1c63a7e044b5f40',
      hu: '272e9045ae98b4ba',
      id: 'e492e018229ce5dc',
      'sr-Latn': 'ae885a638e24c0d3',
      tr: '00b0521d0f2db7b4',
      uk: '1406f1fe42d7d99a',
      ur: '171c000170dfb1c1',
      'zh-Hant': '7a845a19cad3c91d',
    });
  });
});
