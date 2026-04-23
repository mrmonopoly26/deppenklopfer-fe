import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import * as authApi from '../api/auth';
import { clearToken, loadToken, saveToken } from '../services/authService';
import type { LoginRequest, RegisterRequest } from '../types';

interface AuthState {
  token: string | null;
  userId: string | null;
  email: string | null;
}

interface AppContextValue {
  auth: AuthState;
  login: (req: LoginRequest) => Promise<void>;
  register: (req: RegisterRequest) => Promise<void>;
  logout: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({
    token: null,
    userId: null,
    email: null,
  });

  // Load token from storage on startup and fetch current user info
  useEffect(() => {
    const token = loadToken();
    if (!token) return;
    authApi
      .me(token)
      .then((user) => {
        setAuth({
          token,
          userId: String(user['id'] ?? ''),
          email: String(user['email'] ?? ''),
        });
      })
      .catch(() => {
        clearToken();
      });
  }, []);

  const login = useCallback(async (req: LoginRequest) => {
    const res = await authApi.login(req);
    saveToken(res.access_token);
    const user = await authApi.me(res.access_token);
    setAuth({
      token: res.access_token,
      userId: String(user['id'] ?? ''),
      email: String(user['email'] ?? ''),
    });
  }, []);

  const register = useCallback(async (req: RegisterRequest) => {
    const res = await authApi.register(req);
    saveToken(res.access_token);
    const user = await authApi.me(res.access_token);
    setAuth({
      token: res.access_token,
      userId: String(user['id'] ?? ''),
      email: String(user['email'] ?? ''),
    });
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setAuth({ token: null, userId: null, email: null });
  }, []);

  return (
    <AppContext.Provider value={{ auth, login, register, logout }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
