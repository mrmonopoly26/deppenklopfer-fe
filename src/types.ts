// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ChangeRequestCreate {
  request_type: 'email' | 'password';
  new_value: string;
}

export interface ChangeRequestConfirm {
  token: string;
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export type GameMode = 'ramsch' | 'rufspiel' | 'solo' | 'wenz' | 'geier';

export interface TableConfigPayload {
  game_modes: GameMode[];
  euro_per_point: number;
  base_reward: number;
}

export interface TableCreateRequest {
  host_nickname: string;
  config: TableConfigPayload;
}

export interface TableJoinRequest {
  game_code: string;
  nickname: string;
}

export interface ParticipantItem {
  user_id: string;
  nickname: string;
  seat_number: number;
}

export interface TableResponse {
  id: string;
  game_code: string;
  host_user_id: string;
  status: string;
  created_at: string;
  config: TableConfigPayload;
  participants: ParticipantItem[];
}

export interface ChatHistoryItem {
  user_id: string;
  nickname: string;
  message: string;
  created_at: string;
}

export interface RoundItem {
  id: string;
  summary: string;
  payouts_eur: Record<string, number>;
  created_at: string;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface BalanceResponse {
  user_id: string;
  balance_eur: number;
}

export interface TransactionItem {
  id: string;
  table_id: string;
  round_id: string;
  amount_eur: number;
  reason: string;
  created_at: string;
}

// ─── WebSocket messages ───────────────────────────────────────────────────────

export type Suit = 'eichel' | 'gras' | 'herz' | 'schellen';
export type Rank = 'A' | '10' | 'K' | 'O' | 'U' | '9' | '8' | '7';
export type ContractType = 'rufer' | 'solo' | 'wenz' | 'geier' | 'ramsch';
export type Phase = 'bidding' | 'playing' | 'closed' | 'scoring';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface CardInHand extends Card {
  is_played: boolean;
}

export interface TrickCard extends Card {
  seat_number: number;
  user_id: string;
  play_order: number;
}

export interface CompletedTrick {
  trick_index: number;
  winner_seat: number;
  cards: Array<{ seat_number: number; user_id: string; suit: Suit; rank: Rank }>;
}

export interface BidItem {
  user_id: string;
  seat_number: number;
  decision: 'play' | 'pass';
  contract_type: ContractType | null;
  contract_suit: Suit | null;
  called_ace_suit: Suit | null;
  bid_order: number;
}

export interface LegalBidContract {
  contract_type: ContractType;
  callable_suits?: Suit[];
}

// Server → Client messages
export type WsServerMessage =
  | { type: 'pong'; timestamp: string }
  | { type: 'participant_joined'; user_id: string; nickname: string; timestamp: string }
  | { type: 'participant_left'; user_id: string; timestamp: string }
  | { type: 'chat_message'; user_id: string; nickname: string; message: string; timestamp: string }
  | { type: 'game_error'; message: string; state?: GameState; legal_cards?: Card[] }
  | { type: 'game_state' } & GameState
  | { type: 'my_hand'; hand_id: string; cards: CardInHand[] }
  | { type: 'legal_cards'; hand_id?: string; cards: Card[]; message?: string }
  | { type: 'legal_bids'; hand_id: string; contracts: LegalBidContract[] }
  | { type: 'you_are_partner'; hand_id: string; called_ace_suit: Suit };

export interface GameState {
  hand_id: string;
  hand_number: number;
  phase: Phase;
  dealer_seat: number;
  forehand_seat: number;
  current_turn_seat: number | null;
  trick_number: number;
  contract_type: ContractType | null;
  contract_suit: Suit | null;
  called_ace_suit: Suit | null;
  declarer_user_id: string | null;
  partner_user_id: string | null;
  result: Record<string, unknown> | null;
  participants: ParticipantItem[];
  bids: BidItem[];
  current_trick: TrickCard[];
  completed_tricks: CompletedTrick[];
}

// Client → Server messages
export type WsClientMessage =
  | { type: 'ping' }
  | { type: 'chat_message'; message: string }
  | { type: 'start_hand' }
  | { type: 'my_hand' }
  | { type: 'legal_cards' }
  | { type: 'legal_bids' }
  | { type: 'declare_bid'; decision: 'pass' }
  | {
      type: 'declare_bid';
      decision: 'play';
      contract_type: 'rufer';
      called_ace_suit: Suit;
    }
  | {
      type: 'declare_bid';
      decision: 'play';
      contract_type: 'solo';
      contract_suit: Suit;
    }
  | { type: 'declare_bid'; decision: 'play'; contract_type: 'wenz' }
  | { type: 'declare_bid'; decision: 'play'; contract_type: 'geier' }
  | { type: 'play_card'; suit: Suit; rank: Rank };
