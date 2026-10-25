import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { isValidYM, parseYM } from '../engine/dates';
import { usePref } from '../state/prefs';
import { es } from './es';
import { pl } from './pl';
import { ru } from './ru';

// English text is the translation key: t('Net worth') looks the phrase up in the chosen
// language and falls back to English. {placeholders} are filled from params.

export type Lang = 'en' | 'pl' | 'ru' | 'es';
export type Params = Record<string, string | number>;
export type TFn = (key: string, params?: Params) => string;

export const LANGS: { code: Lang; short: string; name: string }[] = [
  { code: 'en', short: 'EN', name: 'English' },
  { code: 'pl', short: 'PL', name: 'Polski' },
  { code: 'ru', short: 'RU', name: 'Русский' },
  { code: 'es', short: 'ES', name: 'Español' },
];

export const DICTS: Record<Lang, Record<string, string>> = { en: {}, pl, ru, es };
const LOCALES: Record<Lang, string> = { en: 'en-US', pl: 'pl-PL', ru: 'ru-RU', es: 'es-ES' };

export function detectLang(): Lang {
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
  return (['pl', 'ru', 'es'] as Lang[]).find((l) => nav.startsWith(l)) ?? 'en';
}

export function formatMonth(ym: string, lang: Lang): string {
  if (!isValidYM(ym)) return ym;
  const { y, m } = parseYM(ym);
  return new Intl.DateTimeFormat(LOCALES[lang], { month: 'short', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

export function translate(lang: Lang, key: string, params?: Params): string {
  const s = DICTS[lang][key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (all, name: string) => {
    const v = params[name];
    if (v == null) return all;
    return name === 'date' && typeof v === 'string' ? formatMonth(v, lang) : String(v);
  });
}

/** Names the engine builds ("Salary: Anna", "Installment: Mortgage: Our flat") → translated. */
export const LABEL_PREFIXES = [
  'Salary: ',
  'Pension: ',
  'Rent received: ',
  'Kid: ',
  'Property costs: ',
  'Running costs: ',
  'Lease initial payment: ',
  'Lease: ',
  'Installment: ',
  'Loan fees: ',
  'Birth: ',
  'Mortgage: ',
  'Loan: ',
];
export const LABEL_FIXED = [
  'Rent',
  'Child benefit',
  'Rental income tax',
  'Rental management',
  'Property purchase costs',
  'Renovation / furnishing',
  'Bank commission',
  'Transaction fees',
  'Property selling costs',
  'Cash',
];

export function translateLabel(lang: Lang, label: string): string {
  if (lang === 'en') return label;
  if (LABEL_FIXED.includes(label)) return translate(lang, label);
  for (const p of LABEL_PREFIXES) {
    if (label.startsWith(p)) return translate(lang, `${p}{name}`, { name: translateLabel(lang, label.slice(p.length)) });
  }
  return label;
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
  /** Translates names built by the engine; leaves user-entered names alone. */
  label: (s: string) => string;
  month: (ym: string) => string;
}

const Ctx = createContext<I18n>({
  lang: 'en',
  setLang: () => undefined,
  t: (k, p) => translate('en', k, p),
  label: (s) => s,
  month: (ym) => formatMonth(ym, 'en'),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = usePref<Lang>('lang', detectLang());
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const t = useCallback<TFn>((k, p) => translate(lang, k, p), [lang]);
  const value = useMemo<I18n>(
    () => ({ lang, setLang, t, label: (s) => translateLabel(lang, s), month: (ym) => formatMonth(ym, lang) }),
    [lang, setLang, t],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  return useContext(Ctx);
}

export { Ctx as I18nContext };
