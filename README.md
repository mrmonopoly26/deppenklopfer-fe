# deppenklopfer-fe

Web frontend for the Deppenklopfer Schafkopf platform.

## Prerequisites

- Node.js 20+
- Backend running on `http://localhost:8000` (see `../deppenklopfer-be`)

## Getting started

```bash
npm install
npm run dev     # http://localhost:5173
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (proxies API + WS to backend) |
| `npm run build` | Type-check + production build |
| `npm run preview` | Serve the production build locally |

## What this app covers

- Register / login (JWT, persisted in localStorage)
- Create a table or join one via 6-digit code
- Real-time game via WebSocket: bidding, card play, chat
- Balance and transaction history
