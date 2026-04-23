import { useEffect, useRef, useState } from 'react';
import * as tablesApi from '../api/tables';
import { useApp } from '../context/AppContext';
import { GameSocket } from '../services/wsService';
import type {
  BidItem,
  Card,
  CardInHand,
  ContractType,
  GameState,
  Phase,
  RoundItem,
  Suit,
  TableResponse,
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

const SUIT_SYMBOLS: Record<Suit, string> = {
  eichel: '♣',
  gras: '♠',
  herz: '♥',
  schellen: '♦',
};

const SUIT_LABELS: Record<Suit, string> = {
  eichel: 'Eichel',
  gras: 'Gras',
  herz: 'Herz',
  schellen: 'Schellen',
};

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
  ramsch: 'Ramsch',
};

function cardLabel(c: Card): string {
  return `${SUIT_SYMBOLS[c.suit]} ${c.rank}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ParticipantList({ table, gameState }: { table: TableResponse; gameState: GameState | null }) {
  return (
    <div className="panel">
      <h3>Spieler</h3>
      <ul className="participant-list">
        {table.participants.map((p) => {
          const isActive =
            gameState?.current_turn_seat === p.seat_number &&
            gameState?.phase !== 'closed';
          return (
            <li key={p.user_id} className={isActive ? 'active-seat' : ''}>
              [{p.seat_number}] {p.nickname}
              {isActive ? ' ◀' : ''}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GameStateDisplay({ gameState }: { gameState: GameState }) {
  return (
    <div className="panel">
      <h3>Hand #{gameState.hand_number} — {PHASE_LABELS[gameState.phase]}</h3>
      <p>
        Spielart: <strong>{gameState.contract_type ? CONTRACT_LABELS[gameState.contract_type] : '—'}</strong>
        {gameState.contract_suit ? ` (${SUIT_LABELS[gameState.contract_suit]})` : ''}
        {gameState.called_ace_suit ? `, gerufene Sau: ${SUIT_LABELS[gameState.called_ace_suit]}` : ''}
      </p>
      {gameState.phase === 'closed' && gameState.result && (
        <pre className="result-box">{JSON.stringify(gameState.result, null, 2)}</pre>
      )}

      {/* Current trick */}
      {gameState.current_trick.length > 0 && (
        <div>
          <strong>Aktueller Stich:</strong>
          <div className="trick-row">
            {gameState.current_trick.map((c) => (
              <span key={`${c.suit}${c.rank}${c.play_order}`} className="trick-card">
                [{c.seat_number}] {cardLabel(c)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BidPanel({
  gameState,
  mySeat,
  enabledModes,
  cardsLoaded,
  onBid,
}: {
  gameState: GameState;
  mySeat: number;
  enabledModes: string[];
  cardsLoaded: boolean;
  onBid: (bid: Parameters<GameSocket['send']>[0] & { type: 'declare_bid' }) => void;
}) {
  const [contract, setContract] = useState<ContractType>('rufer');
  const [suit, setSuit] = useState<Suit>('eichel');
  const [calledAce, setCalledAce] = useState<Suit>('eichel');
  const [decision, setDecision] = useState<'pass' | 'play'>('pass');

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

  if (!cardsLoaded) {
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
    }
  }

  const SUITS: Suit[] = ['eichel', 'gras', 'herz', 'schellen'];
  const ACE_SUITS: Suit[] = ['eichel', 'gras', 'schellen'];

  return (
    <div className="panel highlight">
      <h3>Deine Ansage</h3>
      <BidHistory bids={gameState.bids} participants={gameState.participants} />
      <form onSubmit={submit} className="form">
        <div className="radio-row">
          <label>
            <input type="radio" name="decision" value="pass" checked={decision === 'pass'} onChange={() => setDecision('pass')} />
            Weiter
          </label>
          <label>
            <input type="radio" name="decision" value="play" checked={decision === 'play'} onChange={() => setDecision('play')} />
            Spielen
          </label>
        </div>

        {decision === 'play' && (
          <>
            <label>
              Spielart
              <select value={contract} onChange={(e) => setContract(e.target.value as ContractType)}>
                {enabledModes.includes('rufspiel') && <option value="rufer">Rufspiel</option>}
                {enabledModes.includes('solo') && <option value="solo">Solo</option>}
                {enabledModes.includes('wenz') && <option value="wenz">Wenz</option>}
              </select>
            </label>

            {contract === 'rufer' && (
              <label>
                Gerufene Sau
                <select value={calledAce} onChange={(e) => setCalledAce(e.target.value as Suit)}>
                  {ACE_SUITS.map((s) => <option key={s} value={s}>{SUIT_LABELS[s]}</option>)}
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
  onPlay,
  onRequestLegal,
}: {
  cards: CardInHand[];
  legalCards: Card[];
  isMyTurn: boolean;
  phase: string;
  onPlay: (c: Card) => void;
  onRequestLegal: () => void;
}) {
  const remaining = cards.filter((c) => !c.is_played);
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
              {cardLabel(c)}
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
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [rounds, setRounds] = useState<RoundItem[]>([]);
  const [wsError, setWsError] = useState('');
  const [notification, setNotification] = useState('');
  const [wsConnected, setWsConnected] = useState(false);

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
          setLegalCards([]); // reset on every new state
          break;
        case 'my_hand':
          setMyCards(msg.cards);
          setMyHandId(msg.hand_id);
          break;
        case 'legal_cards':
          setLegalCards(msg.cards);
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
          break;
        case 'pong':
          break;
      }
    });

    socket.onOpen = () => {
      setWsConnected(true);
      socket.send({ type: 'my_hand' });
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
        <div className="table-main">
          <ParticipantList table={table} gameState={gameState} />

          {canStartHand && (
            <div className="panel">
              <button onClick={startHand} className="btn-primary">
                Neue Hand
              </button>
            </div>
          )}

          {!canStartHand && !gameState && (table.participants.length ?? 0) < 4 && (
            <div className="panel">
              <p>Warte auf Spieler… ({table.participants.length}/4)</p>
              <p>
                Spielcode: <strong className="game-code">{gameCode}</strong>
              </p>
            </div>
          )}

          {gameState && <GameStateDisplay gameState={gameState} />}

          {gameState && gameState.phase === 'bidding' && (
            <BidPanel
              gameState={gameState}
              mySeat={mySeat}
              enabledModes={table.config.game_modes}
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
              onPlay={playCard}
              onRequestLegal={requestLegalCards}
            />
          )}
        </div>

        <div className="table-side">
          <ChatPanel entries={chat} onSend={sendMessage} />
          <RoundsPanel rounds={rounds} />
        </div>
      </div>
    </div>
  );
}
