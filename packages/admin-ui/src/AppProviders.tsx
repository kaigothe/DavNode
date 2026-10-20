import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Themed } from './App';
import { AuthProvider } from './auth/AuthContext';
import { initI18n } from './i18n';
import { ThemeProvider } from './theme/ThemeContext';

/** Everything the pages need around them: language, theme, data cache and login. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // A failed request is shown, not retried behind the user's back
          // (a wrong password must not count as three attempts).
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <I18nextProvider i18n={initI18n()}>
      <ThemeProvider>
        <Themed>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>{children}</AuthProvider>
          </QueryClientProvider>
        </Themed>
      </ThemeProvider>
    </I18nextProvider>
  );
}
