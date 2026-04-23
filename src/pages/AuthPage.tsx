import { useState } from 'react';
import { useApp } from '../context/AppContext';

export function AuthPage() {
  const { login, register } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({ email, password });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-center">
      <div className="card">
        <h1>Deppenklopfer</h1>

        <div className="tab-row">
          <button
            className={mode === 'login' ? 'tab active' : 'tab'}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Anmelden
          </button>
          <button
            className={mode === 'register' ? 'tab active' : 'tab'}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Registrieren
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <label>
            E-Mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label>
            Passwort
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? '…' : mode === 'login' ? 'Anmelden' : 'Registrieren'}
          </button>
        </form>
      </div>
    </div>
  );
}
