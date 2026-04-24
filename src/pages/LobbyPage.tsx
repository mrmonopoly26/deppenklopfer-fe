import { useEffect, useState } from 'react';
import * as tablesApi from '../api/tables';
import * as usersApi from '../api/users';
import { useApp } from '../context/AppContext';
import type { BalanceResponse, GameMode, TableResponse } from '../types';

interface Props {
  onJoinedTable: (gameCode: string) => void;
}

const ALL_MODES: GameMode[] = ['rufspiel', 'solo', 'wenz', 'geier', 'ramsch'];
const MODE_LABELS: Record<GameMode, string> = {
  rufspiel: 'Rufspiel',
  solo: 'Solo',
  wenz: 'Wenz',
  geier: 'Geier',
  ramsch: 'Ramsch',
};

export function LobbyPage({ onJoinedTable }: Props) {
  const { auth, logout } = useApp();
  const token = auth.token!;

  const [balance, setBalance] = useState<BalanceResponse | null>(null);

  const defaultNickname = auth.email?.split('@')[0] ?? '';

  // Create table form
  const [hostNickname, setHostNickname] = useState(defaultNickname);
  const [selectedModes, setSelectedModes] = useState<GameMode[]>(ALL_MODES);
  const [euroPerPoint, setEuroPerPoint] = useState(0.1);
  const [baseReward, setBaseReward] = useState(1.0);

  // Join table form
  const [joinCode, setJoinCode] = useState('');
  const [joinNickname, setJoinNickname] = useState(defaultNickname);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    usersApi.getBalance(token).then(setBalance).catch(() => null);
  }, [token]);

  function toggleMode(mode: GameMode) {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (selectedModes.length === 0) {
      setError('Mindestens eine Spielvariante wählen');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const table: TableResponse = await tablesApi.createTable(
        {
          host_nickname: hostNickname || 'Host',
          config: {
            game_modes: selectedModes,
            euro_per_point: euroPerPoint,
            base_reward: baseReward,
          },
        },
        token,
      );
      onJoinedTable(table.game_code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tisch konnte nicht erstellt werden');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const table: TableResponse = await tablesApi.joinTable(
        { game_code: joinCode.toUpperCase(), nickname: joinNickname },
        token,
      );
      onJoinedTable(table.game_code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Beitreten fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="top-bar">
        <span>
          <strong>Deppenklopfer</strong> — {auth.email}
          {balance != null && (
            <span className="balance"> · Kontostand: {balance.balance_eur.toFixed(2)} €</span>
          )}
        </span>
        <button onClick={logout} className="btn-secondary">Abmelden</button>
      </header>

      {error && <p className="error banner">{error}</p>}

      <div className="lobby-grid">
        {/* Create table */}
        <div className="card">
          <h2>Tisch erstellen</h2>
          <form onSubmit={handleCreate} className="form">
            <label>
              Dein Spitzname
              <input
                value={hostNickname}
                onChange={(e) => setHostNickname(e.target.value)}
                placeholder="Gastgeber"
                maxLength={64}
              />
            </label>

            <fieldset>
              <legend>Spielvarianten</legend>
              {ALL_MODES.map((mode) => (
                <label key={mode} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedModes.includes(mode)}
                    onChange={() => toggleMode(mode)}
                  />
                  {MODE_LABELS[mode]}
                </label>
              ))}
            </fieldset>

            <label>
              Euro pro Punkt
              <input
                type="number"
                step="0.01"
                min="0"
                value={euroPerPoint}
                onChange={(e) => setEuroPerPoint(parseFloat(e.target.value) || 0)}
              />
            </label>

            <label>
              Grundeinsatz (€)
              <input
                type="number"
                step="0.1"
                min="0"
                value={baseReward}
                onChange={(e) => setBaseReward(parseFloat(e.target.value) || 0)}
              />
            </label>

            <button type="submit" disabled={loading} className="btn-primary">
              Erstellen
            </button>
          </form>
        </div>

        {/* Tisch beitreten */}
        <div className="card">
          <h2>Tisch beitreten</h2>
          <form onSubmit={handleJoin} className="form">
            <label>
              Spielcode (6 Zeichen)
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="ABC123"
                required
              />
            </label>

            <label>
              Dein Spitzname
              <input
                value={joinNickname}
                onChange={(e) => setJoinNickname(e.target.value)}
                maxLength={64}
                placeholder="Spieler"
                required
              />
            </label>

            <button type="submit" disabled={loading} className="btn-primary">
              Beitreten
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
