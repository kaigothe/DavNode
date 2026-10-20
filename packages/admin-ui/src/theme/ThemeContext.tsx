import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

/** What the user picks; `system` follows the operating system. */
export type ThemeMode = 'system' | 'light' | 'dark';

/** What is actually shown. */
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'davnode.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const isMode = (value: unknown): value is ThemeMode =>
  value === 'system' || value === 'light' || value === 'dark';

function loadMode(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isMode(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const systemPrefersDark = () => window.matchMedia(DARK_QUERY).matches;

/** The theme state of the app. */
export interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode(mode: ThemeMode): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Keeps the theme choice (system, light or dark), follows the operating
 * system live while `system` is chosen, and mirrors the result to
 * `<html data-theme>` for the parts of the page outside React.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(loadMode);
  const systemDark = useSyncExternalStore(
    subscribeToSystemTheme,
    systemPrefersDark,
  );

  const resolved: ResolvedTheme =
    mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', mode);
    }
    root.style.colorScheme = resolved;
  }, [mode, resolved]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice just won't survive a reload.
    }
  }, []);

  const value = useMemo(
    () => ({ mode, resolved, setMode }),
    [mode, resolved, setMode],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** The current {@link ThemeContextValue}. */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside <ThemeProvider>.');
  }
  return value;
}
