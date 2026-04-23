import { get, patch, post } from './client';
import type {
  ChatHistoryItem,
  RoundItem,
  TableConfigPayload,
  TableCreateRequest,
  TableJoinRequest,
  TableResponse,
} from '../types';

export const createTable = (body: TableCreateRequest, token: string) =>
  post<TableResponse>('/tables', body, token);

export const joinTable = (body: TableJoinRequest, token: string) =>
  post<TableResponse>('/tables/join', body, token);

export const getTable = (gameCode: string, token: string) =>
  get<TableResponse>(`/tables/${gameCode}`, token);

export const updateTableConfig = (
  gameCode: string,
  body: TableConfigPayload,
  token: string,
) => patch<TableResponse>(`/tables/${gameCode}/config`, body, token);

export const getChatHistory = (
  gameCode: string,
  token: string,
  limit = 100,
) => get<ChatHistoryItem[]>(`/tables/${gameCode}/chat?limit=${limit}`, token);

export const getRounds = (gameCode: string, token: string, limit = 50) =>
  get<RoundItem[]>(`/tables/${gameCode}/rounds?limit=${limit}`, token);
