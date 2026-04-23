import { get } from './client';
import type { BalanceResponse, TransactionItem } from '../types';

export const getBalance = (token: string) =>
  get<BalanceResponse>('/users/me/balance', token);

export const getTransactions = (token: string, limit = 50) =>
  get<TransactionItem[]>(`/users/me/transactions?limit=${limit}`, token);
