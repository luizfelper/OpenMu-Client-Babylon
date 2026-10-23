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

    expect(KEYS.length).toBe(2644);
    expect(hashes).toEqual({
      en: '6b89e680c9000c08',
      bg: '63b06d85ddff175c',
      zh: 'fc54cc7139a292d8',
      fr: '24056d49c18f9b4e',
      de: '45d18e5113cf2f9e',
      it: '0676a256f2a5ee33',
      ja: 'd14c9089c108c714',
      ko: '70ac2cb2664f7854',
      pl: 'ba61b49093f5f3be',
      pt: 'a4f1edf264a543e0',
      ro: '470c0046cc4a1488',
      ru: '7d5ea9483aa55b3f',
      es: '8a681730eed1d0d8',
      th: 'fbe6ad01d744be65',
      vi: '75b266842ad7c1bf',
      ar: '0e70afdbc31ebee0',
      bn: 'b981d23117719d46',
      ca: 'b89a9b7af2ce5831',
      cs: '4e56c544961ae14e',
      el: '720e9c344a24ea7a',
      eu: '56458b473a4350dd',
      fa: '71d1b43da9ae3279',
      fil: '4e11b57a77ce4264',
      hi: '691fbe8bda4eb762',
      hu: 'de143becfb87052c',
      id: 'd52300e64c27757b',
      'sr-Latn': '4895152a508d5fa8',
      tr: 'f18304b3b1cfab48',
      uk: '4fefc058fe374158',
      ur: 'ffcbea981b83cbf1',
      'zh-Hant': '3e49c9d35d79d974',
    });
  });
});
