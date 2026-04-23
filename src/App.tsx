import { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthPage } from './pages/AuthPage';
import { LobbyPage } from './pages/LobbyPage';
import { TablePage } from './pages/TablePage';

type View = 'lobby' | 'table';

function AppRoutes() {
  const { auth } = useApp();
  const [view, setView] = useState<View>('lobby');
  const [gameCode, setGameCode] = useState<string | null>(null);

  if (!auth.token) {
    return <AuthPage />;
  }

  if (view === 'table' && gameCode) {
    return (
      <TablePage
        gameCode={gameCode}
        onLeaveTable={() => {
          setGameCode(null);
          setView('lobby');
        }}
      />
    );
  }

  return (
    <LobbyPage
      onJoinedTable={(code) => {
        setGameCode(code);
        setView('table');
      }}
    />
  );
}

export function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}
