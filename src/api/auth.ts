import { get, post } from './client';
import type {
  AuthResponse,
  ChangeRequestConfirm,
  ChangeRequestCreate,
  LoginRequest,
  RegisterRequest,
} from '../types';

export const register = (body: RegisterRequest) =>
  post<AuthResponse>('/auth/register', body);

export const login = (body: LoginRequest) =>
  post<AuthResponse>('/auth/login', body);

export const me = (token: string) =>
  get<Record<string, unknown>>('/auth/me', token);

export const refresh = (token: string) =>
  post<AuthResponse>('/auth/refresh', {}, token);

export const createChangeRequest = (body: ChangeRequestCreate, token: string) =>
  post<Record<string, unknown>>('/auth/change-request', body, token);

export const confirmChangeRequest = (body: ChangeRequestConfirm) =>
  post<Record<string, unknown>>('/auth/change-request/confirm', body);
