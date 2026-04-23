import { useEffect, useState } from 'react';
import * as tablesApi from '../api/tables';
import * as usersApi from '../api/users';
import { useApp } from '../context/AppContext';
import type { BalanceResponse, GameMode, TableResponse } from '../types';

interface Props {
  onJoinedTable: (gameCode: string) => void;
}

const ALL_MODES: GameMode[] = ['rufspiel', 'solo', 'wenz', 'ramsch'];

export function LobbyPage({ onJoinedTable }: Props) {
  const { auth, logout } = useApp();
  const token = auth.token!;

  const [balance, setBalance] = useState<BalanceResponse | null>(null);

  // Create table form
  const [hostNickname, setHostNickname] = useState('');
  const [selectedModes, setSelectedModes] = useState<GameMode[]>(['rufspiel', 'wenz', 'ramsch']);
  const [euroPerPoint, setEuroPerPoint] = useState(0.1);
  const [baseReward, setBaseReward] = useState(1.0);

  // Join table form
  const [joinCode, setJoinCode] = useState('');
  const [joinNickname, setJoinNickname] = useState('');

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
      setError(err instanceof Error ? err.message : 'Could not create table');
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
      setError(err instanceof Error ? err.message : 'Could not join table');
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
            <span className="balance"> · Balance: {balance.balance_eur.toFixed(2)} €</span>
          )}
        </span>
        <button onClick={logout} className="btn-secondary">Logout</button>
      </header>

      {error && <p className="error banner">{error}</p>}

      <div className="lobby-grid">
        {/* Create table */}
        <div className="card">
          <h2>Create Table</h2>
          <form onSubmit={handleCreate} className="form">
            <label>
              Your nickname
              <input
                value={hostNickname}
                onChange={(e) => setHostNickname(e.target.value)}
                placeholder="Host"
                maxLength={64}
              />
            </label>

            <fieldset>
              <legend>Game modes</legend>
              {ALL_MODES.map((mode) => (
                <label key={mode} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedModes.includes(mode)}
                    onChange={() => toggleMode(mode)}
                  />
                  {mode}
                </label>
              ))}
            </fieldset>

            <label>
              Euro per point
              <input
                type="number"
                step="0.01"
                min="0"
                value={euroPerPoint}
                onChange={(e) => setEuroPerPoint(parseFloat(e.target.value))}
              />
            </label>

            <label>
              Base reward (€)
              <input
                type="number"
                step="0.1"
                min="0"
                value={baseReward}
                onChange={(e) => setBaseReward(parseFloat(e.target.value))}
              />
            </label>

            <button type="submit" disabled={loading} className="btn-primary">
              Create
            </button>
          </form>
        </div>

        {/* Join table */}
        <div className="card">
          <h2>Join Table</h2>
          <form onSubmit={handleJoin} className="form">
            <label>
              Game code (6 chars)
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="ABC123"
                required
              />
            </label>

            <label>
              Your nickname
              <input
                value={joinNickname}
                onChange={(e) => setJoinNickname(e.target.value)}
                maxLength={64}
                placeholder="Player"
                required
              />
            </label>

            <button type="submit" disabled={loading} className="btn-primary">
              Join
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
