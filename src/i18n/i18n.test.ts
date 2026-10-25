import { describe, expect, it } from 'vitest';
import { EVENT_KINDS } from '../model/defaults';
import { DICTS, LABEL_FIXED, LABEL_PREFIXES, translate, translateLabel, type Lang } from './index';

// Every English text the app can show, collected from the source: t('…'), tr('…'), msg('…')
// and N_('…') calls, plus the few keys built from data (event kinds, engine labels).
const SOURCES = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.ts', '!./*.ts', '!./*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const CALL = /(?<![\w.$])(?:t|tr|msg|N_)\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g;

function unescape(s: string): string {
  return s.replace(/\\(.)/g, (_m, c: string) => (c === 'n' ? '\n' : c));
}

export function collectKeys(): string[] {
  const keys = new Set<string>();
  for (const src of Object.values(SOURCES)) {
    for (const m of src.matchAll(CALL)) keys.add(unescape(m[2]));
  }
  for (const k of EVENT_KINDS) {
    keys.add(k.label);
    keys.add(k.hint);
  }
  for (const k of LABEL_FIXED) keys.add(k);
  for (const p of LABEL_PREFIXES) keys.add(`${p}{name}`);
  return [...keys].sort();
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const LANGS: Lang[] = ['pl', 'ru', 'es'];

describe('translations', () => {
  const keys = collectKeys();

  it('finds the app texts', () => {
    expect(keys.length).toBeGreaterThan(300);
    expect(keys).toContain('Net worth');
    expect(keys).toContain('{name} is born'); // engine message
  });

  for (const lang of LANGS) {
    it(`${lang}: every text is translated, with the same placeholders`, () => {
      const dict = DICTS[lang];
      const missing = keys.filter((k) => !dict[k]?.trim());
      if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SHOW_MISSING) {
        console.log(JSON.stringify(missing, null, 1));
      }
      expect(missing).toEqual([]);
      const wrong = keys.filter((k) => placeholders(dict[k]) !== placeholders(k));
      expect(wrong).toEqual([]);
    });

    it(`${lang}: no leftover translations for texts that no longer exist`, () => {
      const unused = Object.keys(DICTS[lang]).filter((k) => !keys.includes(k));
      expect(unused).toEqual([]);
    });
  }

  it('fills placeholders and formats dates', () => {
    expect(translate('en', 'Moment: {date}', { date: '2036-10' })).toBe('Moment: Oct 2036');
    expect(translate('pl', '{name} is born', { name: 'Ola' })).toContain('Ola');
  });

  it('translates engine-built labels, keeping user-entered names', () => {
    expect(translateLabel('en', 'Installment: Mortgage: Our flat')).toBe('Installment: Mortgage: Our flat');
    const pl = translateLabel('pl', 'Installment: Mortgage: Mieszkanie');
    expect(pl).toContain('Mieszkanie');
    expect(pl).not.toContain('Installment');
    expect(translateLabel('pl', 'Moje konto')).toBe('Moje konto');
  });
});
