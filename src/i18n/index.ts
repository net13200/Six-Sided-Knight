/**
 * Translations. Text is written in English in the code and looked up by that
 * English text at the moment it is shown: `t('Retry')`, or with values,
 * `t('Level {n} unlocked', { n: 3 })`. A missing translation falls back to
 * English. Text defined ahead of time (level names, lessons, the story) is
 * marked with `tk()` so the completeness test finds it, and translated with
 * `t()` wherever it is drawn. Each language is its own file, downloaded only
 * by the players who use it (`loadLang`).
 */

export type Dict = Readonly<Record<string, string>>;

export const LANGS = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'pt', name: 'Português' },
  { id: 'fr', name: 'Français' },
  { id: 'de', name: 'Deutsch' },
  { id: 'it', name: 'Italiano' },
  { id: 'nl', name: 'Nederlands' },
  { id: 'tr', name: 'Türkçe' },
] as const;

export type Lang = (typeof LANGS)[number]['id'];

const LOADERS: Readonly<Record<Exclude<Lang, 'en'>, () => Promise<{ default: Dict }>>> = {
  de: () => import('./de'),
  es: () => import('./es'),
  fr: () => import('./fr'),
  it: () => import('./it'),
  nl: () => import('./nl'),
  pt: () => import('./pt'),
  tr: () => import('./tr'),
};
const loaded: Partial<Record<Lang, Dict>> = {};

let lang: Lang = 'en';
let dict: Dict = {};

/** The browser's language, if we have it; otherwise English. */
export function detectLang(languages: readonly string[] = navigatorLanguages()): Lang {
  for (const l of languages) {
    const base = l.toLowerCase().split('-')[0];
    if (LANGS.some((x) => x.id === base)) return base as Lang;
  }
  return 'en';
}

/** A portal's idea of the player's language (CrazyGames' locale), ahead of the browser's. */
let preferred: string | null = null;
export function preferLocale(locale: string | null): void {
  preferred = locale;
}

function navigatorLanguages(): readonly string[] {
  if (preferred) return [preferred];
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language ?? 'en'];
}

function resolve(choice: string | null | undefined): Lang {
  return LANGS.some((x) => x.id === choice) ? (choice as Lang) : detectLang();
}

/** Downloads a language (if needed) and switches to it. English if it can't be loaded. */
export async function loadLang(choice: string | null | undefined): Promise<Lang> {
  const l = resolve(choice);
  if (l !== 'en' && !loaded[l]) {
    try {
      loaded[l] = (await LOADERS[l]()).default;
    } catch {
      // Offline, say: English for now.
    }
  }
  return setLang(choice);
}

/**
 * Switches language: a saved choice (null = follow the browser). A language
 * not loaded yet (see loadLang) shows English meanwhile.
 */
export function setLang(choice: string | null | undefined): Lang {
  lang = resolve(choice);
  dict = lang === 'en' ? {} : (loaded[lang] ?? {});
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  return lang;
}

export function currentLang(): Lang {
  return lang;
}

/** Translates English text, filling `{name}` placeholders from `vars`. */
export function t(en: string, vars?: Readonly<Record<string, string | number>>): string {
  const s = dict[en] || en;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** `{n} move` / `{n} moves`, translated. */
export function tn(n: number, one: string, many: string): string {
  return t(n === 1 ? one : many, { n });
}

/** Marks text for translation without translating it yet (it is translated where drawn). */
export function tk<T extends string>(en: T): T {
  return en;
}

/** A language's own name ("Deutsch"). */
export function langName(id: string): string {
  return LANGS.find((l) => l.id === id)?.name ?? id;
}
