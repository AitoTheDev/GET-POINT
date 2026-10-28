import type { AuthUser, Menu, PermissionLevel } from '@getpoint/shared';
import { createContext } from 'react';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string, rememberMe: boolean) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Replace the stored user (e.g. after a password change clears mustChangePassword). */
  setUser: (user: AuthUser) => void;
  can: (menu: Menu, level?: PermissionLevel) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
