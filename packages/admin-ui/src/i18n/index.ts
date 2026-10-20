import dayjs from 'dayjs';
import 'dayjs/locale/de';
import 'dayjs/locale/en';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { de } from './de';
import { en } from './en';

/** The languages the UI is translated into. */
export const LANGUAGES = ['en', 'de'] as const;

/** One of {@link LANGUAGES}. */
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'davnode.lang';

const isLanguage = (value: unknown): value is Language =>
  (LANGUAGES as readonly unknown[]).includes(value);

/** The saved choice, else the browser's language, else English. */
export function detectLanguage(): Language {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) {
      return saved;
    }
  } catch {
    // Storage blocked: fall through to the browser language.
  }
  const preferred = navigator.languages?.[0] ?? navigator.language ?? 'en';
  return preferred.toLowerCase().startsWith('de') ? 'de' : 'en';
}

/** Switches the UI language and remembers the choice. */
export async function setLanguage(language: Language): Promise<void> {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // The choice just won't survive a reload.
  }
  await i18n.changeLanguage(language);
}

function applyLanguage(language: string): void {
  dayjs.locale(language);
  document.documentElement.lang = language;
}

/** Initializes i18next once; later calls return the same instance. */
export function initI18n(language: Language = detectLanguage()) {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources: { en: { translation: en }, de: { translation: de } },
      lng: language,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      // The texts are bundled, so there is nothing to wait for.
      initAsync: false,
    });
    i18n.on('languageChanged', applyLanguage);
  }
  applyLanguage(i18n.language);
  return i18n;
}

/** Translates an API error code, falling back to a generic text. */
export function errorText(code: string, t: (key: string) => string): string {
  const key = `errors.${code}`;
  const text = t(key);
  return text === key ? t('errors.unknown') : text;
}
