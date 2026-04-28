import { useEffect, useRef, useState } from 'react';
import blattSvg from '../assets/suits-images/blatt.svg';
import eichelSvg from '../assets/suits-images/eichel.svg';
import herzSvg from '../assets/suits-images/herz.svg';
import schellenSvg from '../assets/suits-images/schellen.svg';
import * as tablesApi from '../api/tables';
import { useApp } from '../context/AppContext';
import { GameSocket } from '../services/wsService';
import type {
  BidItem,
  Card,
  CardInHand,
  ContractType,
  GameState,
  LegalBidContract,
  ParticipantItem,
  Phase,
  RoundItem,
  Suit,
  TableResponse,
  TrickCard,
} from '../types';

interface Props {
  gameCode: string;
  onLeaveTable: () => void;
}

interface ChatEntry {
  key: string;
  nickname: string;
  message: string;
  timestamp: string;
}

// ─── Card display helpers ─────────────────────────────────────────────────────

const SUIT_LABELS: Record<Suit, string> = {
  eichel: 'Eichel',
  gras: 'Blatt',
  herz: 'Herz',
  schellen: 'Schellen',
};

const SUIT_ICONS: Record<Suit, string> = {
  eichel: eichelSvg,
  gras: blattSvg,
  herz: herzSvg,
  schellen: schellenSvg,
};

function CardFace({ card }: { card: Card }) {
  return (
    <span className="card-face">
      <img src={SUIT_ICONS[card.suit]} className="suit-icon" alt={SUIT_LABELS[card.suit]} />
      <span>{card.rank}</span>
    </span>
  );
}

const PHASE_LABELS: Record<Phase, string> = {
  bidding: 'Ansage',
  playing: 'Spiel',
  closed: 'Abgeschlossen',
  scoring: 'Abrechnung',
};

const CONTRACT_LABELS: Record<ContractType, string> = {
  rufer: 'Rufspiel',
  solo: 'Solo',
  wenz: 'Wenz',
  geier: 'Geier',
  ramsch: 'Ramsch',
};

// ─── Card sorting ─────────────────────────────────────────────────────────────

// Suit display order for non-trump groups (left to right)
const SUIT_GROUP_ORDER: Record<Suit, number> = { eichel: 0, gras: 1, herz: 2, schellen: 3 };

// Strength within a side-suit for Rufer/Solo/Ramsch (O and U are always trump, excluded here)
const SIDE_RANK_RUFER: Partial<Record<string, number>> = {
  '7': 1, '8': 2, '9': 3, 'K': 4, '10': 5, 'A': 6,
};

// Strength within a side-suit for Wenz (O stays in suit)
const SIDE_RANK_WENZ: Partial<Record<string, number>> = {
  '7': 1, '8': 2, '9': 3, 'O': 4, 'K': 5, '10': 6, 'A': 7,
};

function getTrumpValue(c: Card, contractType: ContractType | null, trumpSuit: Suit): number {
  // Returns > 0 if trump, the value indicates relative strength (higher = stronger).
  // Returns -1 if not trump.
  if (contractType === 'wenz') {
    if (c.rank !== 'U') return -1;
    const order: Record<Suit, number> = { eichel: 4, gras: 3, herz: 2, schellen: 1 };
    return order[c.suit];
  }
  // Rufer, Solo, Ramsch, or null (default to Rufer ordering)
  if (c.rank === 'O') {
    const order: Record<Suit, number> = { eichel: 14, gras: 13, herz: 12, schellen: 11 };
    return order[c.suit];
  }
  if (c.rank === 'U') {
    const order: Record<Suit, number> = { eichel: 10, gras: 9, herz: 8, schellen: 7 };
    return order[c.suit];
  }
  if (c.suit === trumpSuit) {
    const order: Partial<Record<string, number>> = { '7': 1, '8': 2, '9': 3, 'K': 4, '10': 5, 'A': 6 };
    return order[c.rank] ?? -1;
  }
  return -1;
}

function sortHand(cards: CardInHand[], contractType: ContractType | null, contractSuit: Suit | null): CardInHand[] {
  const trumpSuit: Suit =
    contractType === 'solo' && contractSuit ? contractSuit : 'herz';
  const sideRank = contractType === 'wenz' ? SIDE_RANK_WENZ : SIDE_RANK_RUFER;

  return [...cards].sort((a, b) => {
    const av = getTrumpValue(a, contractType, trumpSuit);
    const bv = getTrumpValue(b, contractType, trumpSuit);
    const aTrump = av >= 0;
    const bTrump = bv >= 0;

    if (aTrump !== bTrump) return aTrump ? 1 : -1; // non-trumps left, trumps right

    if (aTrump) return av - bv; // both trump: weakest first (strongest rightmost)

    // Both non-trump: group by suit, then rank ascending (strongest rightmost)
    const suitDiff = SUIT_GROUP_ORDER[a.suit] - SUIT_GROUP_ORDER[b.suit];
    if (suitDiff !== 0) return suitDiff;
    return (sideRank[a.rank] ?? 0) - (sideRank[b.rank] ?? 0);
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ParticipantList({ participants }: { participants: ParticipantItem[] }) {
  return (
    <div className="panel">
      <h3>Spieler</h3>
      <ul className="participant-list">
        {participants.map((p) => (
          <li key={p.user_id}>[{p.seat_number}] {p.nickname}</li>
        ))}
      </ul>
    </div>
  );
}

// ─── Game table (square layout) ──────────────────────────────────────────────

type SeatPos = 'top' | 'left' | 'right' | 'bottom';

function seatToPos(seat: number, anchor: number): SeatPos {
  const offset = ((seat - 1) - (anchor - 1) + 4) % 4;
  return (['bottom', 'left', 'top', 'right'] as SeatPos[])[offset];
}

function GameTable({ gameState, mySeat }: { gameState: GameState; mySeat: number }) {
  const anchor = mySeat !== -1 ? mySeat : (gameState.participants[0]?.seat_number ?? 1);

  const byPos: Partial<Record<SeatPos, ParticipantItem>> = {};
  gameState.participants.forEach((p) => { byPos[seatToPos(p.seat_number, anchor)] = p; });

  const cardBySeat: Record<number, TrickCard> = {};
  gameState.current_trick.forEach((c) => { cardBySeat[c.seat_number] = c; });

  const renderSeat = (pos: SeatPos) => {
    const p = byPos[pos];
    if (!p) return <div key={pos} className={`table-seat table-seat-${pos}`} />;
    const isActive = gameState.current_turn_seat === p.seat_number && gameState.phase !== 'closed';
    const isDealer = gameState.dealer_seat === p.seat_number;
    return (
      <div key={pos} className={`table-seat table-seat-${pos}${isActive ? ' table-seat-active' : ''}`}>
        <span className="table-seat-name">{p.nickname}{isDealer ? ' ·' : ''}</span>
      </div>
    );
  };

  const renderTrickSlot = (pos: SeatPos) => {
    const p = byPos[pos];
    const card = p ? cardBySeat[p.seat_number] : undefined;
    return (
      <div key={`slot-${pos}`} className={`trick-slot trick-slot-${pos}`}>
        {card && <div className="trick-slot-card"><CardFace card={card} /></div>}
      </div>
    );
  };

  const positions: SeatPos[] = ['top', 'left', 'right', 'bottom'];

  return (
    <div className="game-table">
      {positions.map(renderSeat)}
      <div className="table-felt">
        <div className="table-trick-grid">
          {renderTrickSlot('top')}
          {renderTrickSlot('left')}
          <div className="table-center-info">
            <span className="table-phase">{PHASE_LABELS[gameState.phase]}</span>
            {gameState.contract_type && (
              <span className="table-contract">
                {CONTRACT_LABELS[gameState.contract_type]}
                {gameState.contract_suit ? ` · ${SUIT_LABELS[gameState.contract_suit]}` : ''}
                {gameState.called_ace_suit ? ` · Sau ${SUIT_LABELS[gameState.called_ace_suit]}` : ''}
              </span>
            )}
            {gameState.declarer_user_id && (
              <span className="table-declarer">
                {gameState.participants.find((p) => p.user_id === gameState.declarer_user_id)?.nickname ?? ''}
              </span>
            )}
          </div>
          {renderTrickSlot('right')}
          {renderTrickSlot('bottom')}
        </div>
      </div>
    </div>
  );
}

function BidPanel({
  gameState,
  mySeat,
  legalBids,
  cardsLoaded,
  onBid,
}: {
  gameState: GameState;
  mySeat: number;
  legalBids: LegalBidContract[] | null;
  cardsLoaded: boolean;
  onBid: (bid: Parameters<GameSocket['send']>[0] & { type: 'declare_bid' }) => void;
}) {
  const [contract, setContract] = useState<ContractType>('rufer');
  const [suit, setSuit] = useState<Suit>('eichel');
  const [calledAce, setCalledAce] = useState<Suit>('eichel');
  const [decision, setDecision] = useState<'pass' | 'play'>('pass');

  const availableContracts = legalBids ?? [];
  const rufspielBid = availableContracts.find((b) => b.contract_type === 'rufer');
  const callableSuits = rufspielBid?.callable_suits ?? [];

  // Keep contract selection valid when legalBids arrives
  useEffect(() => {
    if (legalBids && !legalBids.find((b) => b.contract_type === contract)) {
      const first = legalBids[0]?.contract_type;
      if (first) setContract(first);
    }
  }, [legalBids]);

  // Keep calledAce valid when callable suits change
  useEffect(() => {
    if (callableSuits.length > 0 && !callableSuits.includes(calledAce)) {
      setCalledAce(callableSuits[0]);
    }
  }, [callableSuits.join(',')]);

  if (gameState.phase !== 'bidding' || gameState.current_turn_seat !== mySeat) {
    const waitingFor = gameState.participants.find(
      (p) => p.seat_number === gameState.current_turn_seat,
    );
    if (gameState.phase === 'bidding') {
      return (
        <div className="panel">
          <p>Warte auf <strong>{waitingFor?.nickname ?? '?'}</strong>…</p>
          <BidHistory bids={gameState.bids} participants={gameState.participants} />
        </div>
      );
    }
    return null;
  }

  if (!cardsLoaded || legalBids === null) {
    return (
      <div className="panel highlight">
        <h3>Deine Ansage</h3>
        <p>Karten werden geladen…</p>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (decision === 'pass') {
      onBid({ type: 'declare_bid', decision: 'pass' });
      return;
    }
    if (contract === 'rufer') {
      onBid({ type: 'declare_bid', decision: 'play', contract_type: 'rufer', called_ace_suit: calledAce });
    } else if (contract === 'solo') {
      onBid({ type: 'declare_bid', decision: 'play', contract_type: 'solo', contract_suit: suit });
    } else if (contract === 'wenz') {
      onBid({ type: 'declare_bid', decision: 'play', contract_type: 'wenz' });
    } else if (contract === 'geier') {
      onBid({ type: 'declare_bid', decision: 'play', contract_type: 'geier' });
    }
  }

  const SUITS: Suit[] = ['eichel', 'gras', 'herz', 'schellen'];

  return (
    <div className="panel highlight">
      <h3>Deine Ansage</h3>
      <BidHistory bids={gameState.bids} participants={gameState.participants} />
      <form onSubmit={submit} className="form">
        <div className="bid-pill-row">
          <button type="button" className={`bid-pill${decision === 'pass' ? ' active' : ''}`} onClick={() => setDecision('pass')}>
            Weiter
          </button>
          <button type="button" className={`bid-pill${decision === 'play' ? ' active' : ''}`} onClick={() => setDecision('play')}>
            Spielen
          </button>
        </div>

        {decision === 'play' && (
          <>
            <label>
              Spielart
              <select value={contract} onChange={(e) => setContract(e.target.value as ContractType)}>
                {availableContracts.map((b) => (
                  <option key={b.contract_type} value={b.contract_type}>
                    {CONTRACT_LABELS[b.contract_type]}
                  </option>
                ))}
              </select>
            </label>

            {contract === 'rufer' && (
              <label>
                Gerufene Sau
                <select value={calledAce} onChange={(e) => setCalledAce(e.target.value as Suit)}>
                  {callableSuits.map((s) => <option key={s} value={s}>{SUIT_LABELS[s]}</option>)}
                </select>
              </label>
            )}

            {contract === 'solo' && (
              <label>
                Trumpffarbe
                <select value={suit} onChange={(e) => setSuit(e.target.value as Suit)}>
                  {SUITS.map((s) => <option key={s} value={s}>{SUIT_LABELS[s]}</option>)}
                </select>
              </label>
            )}
          </>
        )}

        <button type="submit" className="btn-primary">Ansagen</button>
      </form>
    </div>
  );
}

function BidHistory({
  bids,
  participants,
}: {
  bids: BidItem[];
  participants: Array<{ user_id: string; nickname: string; seat_number: number }>;
}) {
  if (bids.length === 0) return null;
  const byId = Object.fromEntries(participants.map((p) => [p.user_id, p.nickname]));
  return (
    <ul className="bid-history">
      {bids.map((b) => (
        <li key={b.bid_order}>
          <strong>{byId[b.user_id] ?? b.user_id}</strong>:{' '}
          {b.decision === 'pass' ? 'Weiter' : `${b.contract_type ? CONTRACT_LABELS[b.contract_type] : ''}${b.contract_suit ? ` (${SUIT_LABELS[b.contract_suit]})` : ''}${b.called_ace_suit ? ` Sau:${SUIT_LABELS[b.called_ace_suit]}` : ''}`}
        </li>
      ))}
    </ul>
  );
}

function HandPanel({
  cards,
  legalCards,
  isMyTurn,
  phase,
  contractType,
  contractSuit,
  onPlay,
  onRequestLegal,
}: {
  cards: CardInHand[];
  legalCards: Card[];
  isMyTurn: boolean;
  phase: string;
  contractType: ContractType | null;
  contractSuit: Suit | null;
  onPlay: (c: Card) => void;
  onRequestLegal: () => void;
}) {
  const remaining = sortHand(cards.filter((c) => !c.is_played), contractType, contractSuit);
  if (remaining.length === 0) return null;

  const legalSet = new Set(legalCards.map((c) => `${c.suit}|${c.rank}`));
  const isPlayPhase = phase === 'playing';

  return (
    <div className="panel">
      <h3>
        Dein Blatt
        {isMyTurn && isPlayPhase && (
          <button onClick={onRequestLegal} className="btn-secondary small" style={{ marginLeft: 8 }}>
            Spielbare Karten
          </button>
        )}
      </h3>
      <div className="card-row">
        {remaining.map((c) => {
          const key = `${c.suit}|${c.rank}`;
          const isLegal = legalSet.size === 0 || legalSet.has(key);
          const canPlay = isMyTurn && isPlayPhase;
          return (
            <button
              key={key}
              onClick={() => canPlay && isLegal && onPlay(c)}
              disabled={!canPlay || !isLegal}
              className={`card-btn ${isLegal && canPlay ? 'legal' : ''}`}
              title={!isLegal ? 'Nicht spielbar' : ''}
            >
              <CardFace card={c} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChatPanel({
  entries,
  onSend,
}: {
  entries: ChatEntry[];
  onSend: (msg: string) => void;
}) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <div className="panel chat-panel">
      <h3>Chat</h3>
      <div className="chat-messages">
        {entries.map((e) => (
          <div key={e.key} className="chat-line">
            <span className="chat-nick">{e.nickname}:</span> {e.message}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="chat-form">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nachricht…"
          maxLength={500}
        />
        <button type="submit" className="btn-secondary">Senden</button>
      </form>
    </div>
  );
}

function RoundsPanel({ rounds }: { rounds: RoundItem[] }) {
  if (rounds.length === 0) return null;
  return (
    <div className="panel">
      <h3>Runden ({rounds.length})</h3>
      <ul className="round-list">
        {[...rounds].reverse().map((r) => (
          <li key={r.id}>
            <strong>{r.summary}</strong>
            <span className="round-payouts">
              {Object.entries(r.payouts_eur).map(([uid, amt]) => (
                <span key={uid}>{uid.slice(0, 6)}…: {amt >= 0 ? '+' : ''}{amt.toFixed(2)} €</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Main TablePage ───────────────────────────────────────────────────────────

export function TablePage({ gameCode, onLeaveTable }: Props) {
  const { auth } = useApp();
  const token = auth.token!;
  const userId = auth.userId!;

  const [table, setTable] = useState<TableResponse | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myCards, setMyCards] = useState<CardInHand[]>([]);
  const [myHandId, setMyHandId] = useState<string>('');
  const [legalCards, setLegalCards] = useState<Card[]>([]);
  const [legalBids, setLegalBids] = useState<LegalBidContract[] | null>(null);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [rounds, setRounds] = useState<RoundItem[]>([]);
  const [wsError, setWsError] = useState('');
  const [notification, setNotification] = useState('');
  const [wsConnected, setWsConnected] = useState(false);

  const [mobileTab, setMobileTab] = useState<'game' | 'chat' | 'rounds'>('game');

  const socketRef = useRef<GameSocket | null>(null);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mySeat =
    table?.participants.find((p) => p.user_id === userId)?.seat_number ?? -1;

  function notify(msg: string) {
    if (notifyTimerRef.current !== null) clearTimeout(notifyTimerRef.current);
    setNotification(msg);
    notifyTimerRef.current = setTimeout(() => setNotification(''), 3000);
  }

  // Initial REST data load
  useEffect(() => {
    tablesApi.getTable(gameCode, token).then(setTable).catch(() => null);
    tablesApi
      .getChatHistory(gameCode, token)
      .then((history) =>
        setChat(
          history.map((h, i) => ({
            key: `hist-${i}`,
            nickname: h.nickname,
            message: h.message,
            timestamp: h.created_at,
          })),
        ),
      )
      .catch(() => null);
    tablesApi.getRounds(gameCode, token).then(setRounds).catch(() => null);
  }, [gameCode, token]);

  // WebSocket lifecycle
  useEffect(() => {
    const socket = new GameSocket(gameCode, token, (msg) => {
      switch (msg.type) {
        case 'game_state':
          setGameState(msg);
          setLegalCards([]);
          setLegalBids(null);
          break;
        case 'my_hand':
          setMyCards(msg.cards);
          setMyHandId(msg.hand_id);
          break;
        case 'legal_cards':
          setLegalCards(msg.cards);
          break;
        case 'legal_bids':
          setLegalBids(msg.contracts);
          break;
        case 'chat_message':
          setChat((prev) => [
            ...prev,
            {
              key: `ws-${Date.now()}-${Math.random()}`,
              nickname: msg.nickname,
              message: msg.message,
              timestamp: msg.timestamp,
            },
          ]);
          break;
        case 'participant_joined':
          notify(`${msg.nickname} ist beigetreten`);
          // Refresh table to get updated participant list
          tablesApi.getTable(gameCode, token).then(setTable).catch(() => null);
          break;
        case 'participant_left':
          notify(`Ein Spieler hat verlassen`);
          tablesApi.getTable(gameCode, token).then(setTable).catch(() => null);
          break;
        case 'you_are_partner':
          notify(`Du bist der Partner! Gerufene Farbe: ${SUIT_LABELS[msg.called_ace_suit]}`);
          break;
        case 'game_error':
          if (wsErrorTimerRef.current !== null) clearTimeout(wsErrorTimerRef.current);
          setWsError(msg.message);
          wsErrorTimerRef.current = setTimeout(() => setWsError(''), 4000);
          // Re-sync hand in case an optimistic card play was rejected.
          socketRef.current?.send({ type: 'my_hand' });
          if (msg.legal_cards) setLegalCards(msg.legal_cards);
          break;
        case 'pong':
          break;
      }
    });

    socket.onOpen = () => {
      setWsConnected(true);
      socket.send({ type: 'my_hand' });
    };

    socket.onClose = () => {
      setWsConnected(false);
    };

    socket.connect();
    socketRef.current = socket;

    return () => {
      socket.disconnect();
      setWsConnected(false);
      if (notifyTimerRef.current !== null) clearTimeout(notifyTimerRef.current);
      if (wsErrorTimerRef.current !== null) clearTimeout(wsErrorTimerRef.current);
    };
  }, [gameCode, token]);

  // When a new hand starts, ensure we have cards for it
  useEffect(() => {
    if (gameState?.hand_id && gameState.hand_id !== myHandId) {
      socketRef.current?.send({ type: 'my_hand' });
    }
  }, [gameState?.hand_id, myHandId]);

  // Reload rounds after each hand closes
  useEffect(() => {
    if (gameState?.phase === 'closed') {
      tablesApi.getRounds(gameCode, token).then(setRounds).catch(() => null);
    }
  }, [gameState?.phase, gameCode, token]);

  // Fetch legal bids when it becomes our turn during the bidding phase
  useEffect(() => {
    if (
      gameState?.phase === 'bidding' &&
      gameState.current_turn_seat === mySeat &&
      mySeat !== -1
    ) {
      socketRef.current?.send({ type: 'legal_bids' });
    }
  }, [gameState?.phase, gameState?.current_turn_seat, mySeat]);

  function sendMessage(msg: string) {
    socketRef.current?.send({ type: 'chat_message', message: msg });
  }

  function startHand() {
    socketRef.current?.send({ type: 'start_hand' });
  }

  function declareBid(bid: Parameters<GameSocket['send']>[0] & { type: 'declare_bid' }) {
    socketRef.current?.send(bid);
  }

  function requestLegalCards() {
    setLegalCards([]);
    socketRef.current?.send({ type: 'legal_cards' });
  }

  function playCard(c: Card) {
    setLegalCards([]);
    setMyCards((prev) =>
      prev.map((card) =>
        card.suit === c.suit && card.rank === c.rank ? { ...card, is_played: true } : card
      )
    );
    socketRef.current?.send({ type: 'play_card', suit: c.suit, rank: c.rank });
  }

  const isHost = table?.host_user_id === userId;
  const canStartHand = isHost && (!gameState || gameState.phase === 'closed') && (table?.participants.length ?? 0) >= 4;

  if (!table) {
    return <div className="page-center"><p>Tisch wird geladen…</p></div>;
  }

  return (
    <div className="page">
      <header className="top-bar">
        <span>
          Table <strong>{gameCode}</strong> · {table.status}
          {!wsConnected && <span className="ws-badge disconnected"> ● getrennt</span>}
          {wsConnected && <span className="ws-badge connected"> ● verbunden</span>}
        </span>
        <span className="player-name-badge">
          {table.participants.find((p) => p.user_id === userId)?.nickname ?? ''}
        </span>
        <button onClick={onLeaveTable} className="btn-secondary">← Verlassen</button>
      </header>

      {notification && <p className="banner info">{notification}</p>}
      {wsError && <p className="banner error">{wsError}</p>}

      <div className="table-layout">
        <div className={`table-main${mobileTab !== 'game' ? ' mobile-hidden' : ''}`}>
          {!gameState && <ParticipantList participants={table.participants} />}

          {canStartHand && (
            <div className="panel">
              <button onClick={startHand} className="btn-primary">
                Neue Hand
              </button>
            </div>
          )}

          {!canStartHand && !gameState && table.participants.length < 4 && (
            <div className="panel">
              <p>Warte auf Spieler… ({table.participants.length}/4)</p>
              <p>
                Spielcode: <strong className="game-code">{gameCode}</strong>
              </p>
            </div>
          )}

          {gameState && <GameTable gameState={gameState} mySeat={mySeat} />}

          {gameState?.phase === 'closed' && gameState.result && (
            <div className="panel">
              <h3>Ergebnis</h3>
              <pre className="result-box">{JSON.stringify(gameState.result, null, 2)}</pre>
            </div>
          )}

          {gameState && gameState.phase === 'bidding' && (
            <BidPanel
              gameState={gameState}
              mySeat={mySeat}
              legalBids={legalBids}
              cardsLoaded={myHandId === gameState.hand_id}
              onBid={declareBid}
            />
          )}

          {myCards.length > 0 && gameState && (
            <HandPanel
              cards={myCards}
              legalCards={legalCards}
              isMyTurn={gameState.current_turn_seat === mySeat}
              phase={gameState.phase}
              contractType={gameState.contract_type}
              contractSuit={gameState.contract_suit}
              onPlay={playCard}
              onRequestLegal={requestLegalCards}
            />
          )}
        </div>

        <div className={`table-side${mobileTab === 'game' ? ' mobile-hidden' : ''}`}>
          <div className={mobileTab === 'rounds' ? 'mobile-hidden' : ''}>
            <ChatPanel entries={chat} onSend={sendMessage} />
          </div>
          <div className={mobileTab === 'chat' ? 'mobile-hidden' : ''}>
            <RoundsPanel rounds={rounds} />
          </div>
        </div>
      </div>

      {(() => {
        const isMyTurn = gameState?.current_turn_seat === mySeat && gameState?.phase !== 'closed';
        return (
          <nav className="mobile-tab-bar">
            <button
              className={`mobile-tab-btn${mobileTab === 'game' ? ' active' : ''}${isMyTurn && mobileTab !== 'game' ? ' urgent' : ''}`}
              onClick={() => setMobileTab('game')}
            >
              Spiel
            </button>
            <button
              className={`mobile-tab-btn${mobileTab === 'chat' ? ' active' : ''}`}
              onClick={() => setMobileTab('chat')}
            >
              Chat
            </button>
            <button
              className={`mobile-tab-btn${mobileTab === 'rounds' ? ' active' : ''}`}
              onClick={() => setMobileTab('rounds')}
            >
              Runden
            </button>
          </nav>
        );
      })()}
    </div>
  );
}
