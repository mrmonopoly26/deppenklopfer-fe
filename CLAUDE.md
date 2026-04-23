# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start dev server on http://localhost:5173
npm run build        # type-check + production build
npm run preview      # serve the production build locally
```

The dev server proxies `/api/*` → `http://localhost:8000` and WebSocket `/ws/*` → `ws://localhost:8000`, so the backend must be running on port 8000.

## Architecture

React + TypeScript SPA built with Vite. No routing library, no state library, no CSS framework — only React built-ins and plain fetch/WebSocket.

### Layers

```
src/
  api/           ← Network layer: raw HTTP calls only (fetch wrapper, one file per resource)
  services/      ← Service layer: token persistence (authService), WebSocket lifecycle (wsService)
  context/       ← React bridge: AppContext exposes auth state + login/logout to the whole tree
  pages/         ← UI layer: one file per screen (AuthPage, LobbyPage, TablePage)
  types.ts       ← All shared TypeScript types derived from the OpenAPI spec + WS protocol
  index.css      ← Single flat CSS file (no modules, no preprocessor)
```

**Rule:** pages call services; services call api; api never touches React or localStorage.

### State-based navigation (no React Router)

`App.tsx` holds a `view` state (`'lobby' | 'table'`) and renders the matching page component. Navigation is done by calling `setView` / `setGameCode` via callback props. No URL changes.

### WebSocket (src/services/wsService.ts)

`GameSocket` wraps the native `WebSocket` API. One instance per table session, created/destroyed in a `useEffect` in `TablePage`. Auth is passed as a URL query param: `?token=<jwt>`.

Inbound messages are dispatched by `type` directly in the `useEffect` handler and stored in local `useState`.

### Backend contract

REST base URL (via Vite proxy): `/api` → `http://localhost:8001`
WebSocket URL (via Vite proxy): `ws://localhost:5173/ws/tables/{game_code}?token={jwt}` → `ws://localhost:8001/ws/tables/{game_code}?token={jwt}`

Full REST contract: `openapi.json` in the repo root.
Full WS protocol + game rules: `../deppenklopfer-be/CLAUDE.md` and `../deppenklopfer-be/docs/schafkopf_rules.md`.

### File size

Keep every file under 400 lines. `TablePage.tsx` is the longest; split out sub-components if it grows further.

### Use of magic strings

Do not use magic strings for things like contract types, message types, or card suits. Define them as TypeScript `enum`s or string literal unions in `src/types.ts` and import them where needed. This ensures type safety and consistency across the codebase.