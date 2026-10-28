import { type AuthUser, hasPermission, type Menu, type PermissionLevel } from '@getpoint/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  apiSend,
  refreshSession,
  type SessionResponse,
  setAccessToken,
  setOnSessionLost,
} from '../api/client';
import { AuthContext, type AuthStatus } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUserState] = useState<AuthUser | null>(null);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUserState(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Restore the session from the refresh cookie on page load.
  useEffect(() => {
    let cancelled = false;
    refreshSession().then((session) => {
      if (cancelled) return;
      if (session) {
        setUserState(session.user);
        setStatus('authenticated');
      } else {
        setStatus('anonymous');
      }
    });
    setOnSessionLost(clear);
    return () => {
      cancelled = true;
      setOnSessionLost(null);
    };
  }, [clear]);

  const login = useCallback(async (email: string, password: string, rememberMe: boolean) => {
    const session = await apiSend<SessionResponse>('POST', '/auth/login', {
      email,
      password,
      rememberMe,
    });
    setAccessToken(session.accessToken);
    setUserState(session.user);
    setStatus('authenticated');
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiSend('POST', '/auth/logout');
    } finally {
      clear();
    }
  }, [clear]);

  const setUser = useCallback((next: AuthUser) => setUserState(next), []);

  const can = useCallback(
    (menu: Menu, level: PermissionLevel = 'view') =>
      Boolean(user && hasPermission(user.permissions, menu, level)),
    [user],
  );

  const value = useMemo(
    () => ({ status, user, login, logout, setUser, can }),
    [status, user, login, logout, setUser, can],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
