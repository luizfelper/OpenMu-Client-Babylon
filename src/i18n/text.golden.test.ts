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

    expect(KEYS.length).toBe(2640);
    expect(hashes).toEqual({
      en: '5c98912e37ff2245',
      bg: 'b588643ef24a6cea',
      zh: 'c4abe57f043167e1',
      fr: '0d6f90fba1f882de',
      de: 'b397a22324c889a2',
      it: '9fd2f872d451732d',
      ja: '569a84a2d141bf94',
      ko: '5f598d44a42d78f6',
      pl: '4ab97d3c2a9465cf',
      pt: '9569a1b6c93eda7d',
      ro: 'f989d88b98a951e4',
      ru: 'ecb31fb777a14c2f',
      es: '80608a1d7f9a9cad',
      th: '882d0ccb6510247a',
      vi: '2e4d5dfb978382d7',
      ar: 'ef4bcdc38975314b',
      bn: 'a2b6aaff3e4a0899',
      ca: '98af271e2f487163',
      cs: '5c22fbdf0c7f71eb',
      el: 'c605b0d382ac8e9a',
      eu: '15b6cdc87edd50b8',
      fa: 'e7c231b08d6d9a5e',
      fil: '30c557f6e12d46e5',
      hi: '234ba728f3959478',
      hu: '7270dc7b6b2cc532',
      id: '874b566bb2695df7',
      'sr-Latn': '563bf4bd0a1f7a39',
      tr: '39c4b0c87ccab7e7',
      uk: '50327dc2caf3a9bd',
      ur: '7d22d5929250afa7',
      'zh-Hant': '2b9227e20c6ae939',
    });
  });
});
