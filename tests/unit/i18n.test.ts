import { afterEach, describe, expect, it } from 'vitest';
import { detectLang, LANGS, loadLang, setLang, t, tn } from '../../src/i18n';
import de from '../../src/i18n/de';
import es from '../../src/i18n/es';
import fr from '../../src/i18n/fr';
import itDict from '../../src/i18n/it';
import nl from '../../src/i18n/nl';
import pt from '../../src/i18n/pt';
import tr from '../../src/i18n/tr';
import he from '../../src/i18n/he';

const DICTS = { de, es, fr, it: itDict, nl, pt, tr, he };
import { collectKeys, placeholders } from '../../tools/i18n-keys';

const { keys, problems } = collectKeys();

describe('translations', () => {
  afterEach(() => setLang('en'));

  it('finds the text to translate, all as plain strings', () => {
    expect(problems).toEqual([]);
    expect(keys.size).toBeGreaterThan(500);
    expect(keys.has('Knocked out!')).toBe(true);
    expect(keys.has('First Roll')).toBe(true); // a level name
    expect(keys.has('Skeleton')).toBe(true); // an enemy
  });

  for (const [lang, dict] of Object.entries(DICTS)) {
    it(`${lang}: translates everything, with the same {placeholders}`, () => {
      const missing = [...keys].filter((k) => !dict[k]?.trim());
      expect(missing).toEqual([]);
      const wrong = [...keys].filter(
        (k) => placeholders(k).join() !== placeholders(dict[k] ?? '').join(),
      );
      expect(wrong).toEqual([]);
    });

    it(`${lang}: has no leftover keys`, () => {
      expect(Object.keys(dict).filter((k) => !keys.has(k))).toEqual([]);
    });
  }

  it('offers English and seven more', () => {
    expect(LANGS.map((l) => l.id)).toEqual(['en', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'tr', 'he']);
  });

  it('follows the browser, else English', () => {
    expect(detectLang(['de-AT', 'en'])).toBe('de');
    expect(detectLang(['pt-BR'])).toBe('pt');
    expect(detectLang(['ja', 'fr-CA'])).toBe('fr');
    expect(detectLang(['ja'])).toBe('en');
    expect(detectLang([])).toBe('en');
  });

  it('translates, fills placeholders and falls back to English', async () => {
    await loadLang('de');
    expect(t('Retry')).toBe('Neustart');
    expect(t('Level {n} unlocked', { n: 4 })).toBe('Level 4 freigeschaltet');
    expect(tn(1, '{n} floor', '{n} floors')).toBe('1 Ebene');
    expect(tn(3, '{n} floor', '{n} floors')).toBe('3 Ebenen');
    expect(t('Not a key')).toBe('Not a key');
    setLang('en');
    expect(t('Level {n} unlocked', { n: 4 })).toBe('Level 4 unlocked');
  });

  it('a saved choice wins over the browser; an unknown one follows the browser', () => {
    expect(setLang('tr')).toBe('tr');
    expect(t('Retry')).toBe('Retry'); // not downloaded yet: English meanwhile
    expect(setLang('xx')).toBe(detectLang());
    expect(setLang(null)).toBe(detectLang());
  });
});
