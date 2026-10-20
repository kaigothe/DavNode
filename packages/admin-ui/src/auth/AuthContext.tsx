import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  apiRequest,
  basicAuthorization,
  type Me,
  type RequestOptions,
} from '../api/client';
import {
  clearSession,
  loadSession,
  saveLastTenant,
  saveSession,
  type Session,
} from './session';

/** Why the user is logged out; the login page explains it. */
export type LogoutReason = 'expired' | 'manual';

/** The authentication state and the API access that goes with it. */
export interface AuthContextValue {
  /** `loading` while a remembered session is being checked. */
  status: 'loading' | 'anonymous' | 'authenticated';
  session: Session | null;
  me: Me | null;
  /** Set when a session ended without the user asking for it. */
  logoutReason: LogoutReason | null;
  /**
   * Checks the credentials against `GET /me` and starts the session.
   *
   * @throws {@link ApiError} If the credentials are wrong or the server is unreachable.
   */
  login(tenantSlug: string, username: string, password: string): Promise<void>;
  /** Ends the session. */
  logout(): void;
  /**
   * Calls the Admin API as the logged-in user. A `401` ends the session.
   *
   * @throws {@link ApiError}
   */
  request<T>(path: string, options?: RequestOptions): Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Provides {@link AuthContextValue} to the app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>(
    session ? 'loading' : 'anonymous',
  );
  const [logoutReason, setLogoutReason] = useState<LogoutReason | null>(null);
  const sessionRef = useRef(session);

  const end = useCallback(
    (reason: LogoutReason) => {
      clearSession();
      sessionRef.current = null;
      setSession(null);
      setMe(null);
      setStatus('anonymous');
      setLogoutReason(reason);
      queryClient.clear();
    },
    [queryClient],
  );

  // A session remembered by the tab is only trusted after the server agrees.
  useEffect(() => {
    if (!session || status !== 'loading') {
      return;
    }
    const controller = new AbortController();
    apiRequest<Me>(session, '/me', { signal: controller.signal })
      .then((value) => {
        setMe(value);
        setStatus('authenticated');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        // Whatever went wrong, the stored session is of no use.
        end(
          error instanceof ApiError && error.status === 401
            ? 'expired'
            : 'manual',
        );
      });
    return () => controller.abort();
  }, [session, status, end]);

  const login = useCallback<AuthContextValue['login']>(
    async (tenantSlug, username, password) => {
      const next: Session = {
        tenantSlug: tenantSlug.trim(),
        username,
        authorization: basicAuthorization(username, password),
      };
      const value = await apiRequest<Me>(next, '/me');
      saveSession(next);
      saveLastTenant(next.tenantSlug);
      sessionRef.current = next;
      setSession(next);
      setMe(value);
      setLogoutReason(null);
      setStatus('authenticated');
    },
    [],
  );

  const logout = useCallback(() => end('manual'), [end]);

  const request = useCallback<AuthContextValue['request']>(
    async <T,>(path: string, options?: RequestOptions) => {
      const current = sessionRef.current;
      if (!current) {
        throw new ApiError(401, 'unauthorized', 'Not logged in.');
      }
      try {
        return await apiRequest<T>(current, path, options);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          end('expired');
        }
        throw error;
      }
    },
    [end],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, me, logoutReason, login, logout, request }),
    [status, session, me, logoutReason, login, logout, request],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** The current {@link AuthContextValue}. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return value;
}
