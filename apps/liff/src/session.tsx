import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  errorText,
  hasToken,
  type LiffConfig,
  type MemberView,
  post,
  setOnLoginLost,
  setToken,
} from './api';
import { getIdToken, initLine, setMockUser } from './line';
import { SessionContext, type SessionValue, type State } from './sessionContext';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const signIn = useCallback(async () => {
    try {
      const config = await api<LiffConfig>('/config');
      await initLine(config);
      if (hasToken()) {
        try {
          const me = await api<{ displayName: string | null; member: MemberView | null }>('/me');
          setState({ status: 'ready', config, ...me });
          return;
        } catch {
          setToken(null); // expired or from another user: sign in again below
        }
      }
      const idToken = getIdToken(config);
      if (!idToken) {
        // Mock: show the test login form. Live: the page is moving to the LINE login.
        setState(
          config.lineMode === 'mock' ? { status: 'dev-login', config } : { status: 'loading' },
        );
        return;
      }
      const session = await post<{
        token: string;
        displayName: string | null;
        member: MemberView | null;
      }>('/session', { idToken });
      setToken(session.token);
      setState({
        status: 'ready',
        config,
        displayName: session.displayName,
        member: session.member,
      });
    } catch (err) {
      setState({ status: 'error', message: errorText(err) });
    }
  }, []);

  useEffect(() => {
    // signIn only sets state after awaiting the API, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void signIn();
    setOnLoginLost(() => void signIn());
    return () => setOnLoginLost(null);
  }, [signIn]);

  const value = useMemo<SessionValue>(
    () => ({
      state,
      signIn,
      setMember: (member) => setState((s) => (s.status === 'ready' ? { ...s, member } : s)),
      switchMockUser: () => {
        setMockUser(null);
        setToken(null);
        void signIn();
      },
    }),
    [state, signIn],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
