import { createContext, useContext } from 'react';
import type { LiffConfig, MemberView } from './api';

export type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  /** Development only: pick a pretend LINE user first. */
  | { status: 'dev-login'; config: LiffConfig }
  | {
      status: 'ready';
      config: LiffConfig;
      displayName: string | null;
      member: MemberView | null;
    };

export interface SessionValue {
  state: State;
  /** Sign in again (after the dev login form, or when the token expired). */
  signIn: () => Promise<void>;
  /** Reload the member (after sign-up). */
  setMember: (member: MemberView) => void;
  /** Development: forget the pretend LINE user. */
  switchMockUser: () => void;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside SessionProvider');
  return value;
}

/** For pages shown only once signed in (the App renders them only in the "ready" state). */
export function useReady() {
  const { state, setMember, switchMockUser } = useSession();
  if (state.status !== 'ready') throw new Error('session not ready');
  return { ...state, setMember, switchMockUser };
}
