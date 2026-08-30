# MorphBoards

A local, Miro-style infinite canvas app for virtual production shot notes and asset tracking.
Boards live in a local SQLite database; uploaded images are stored as real files on disk under `server/data/`.

## Features

- Infinite canvas with smooth pan/zoom
- Shapes, text, sticky notes, lines & arrows
- Image upload (drag-drop, paste, file picker)
- Hyperlink cards
- Connectors that attach to elements and follow them
- Frames that move/scale their contents together (shot groups)
- Comment pins with threads + resolve, and a comments sidebar
- Undo/redo, copy/paste, keyboard shortcuts
- Autosave, board manager, zip export/import for backup
- Share links with three roles — read-only, comment-only, editor
- Real-time collaboration: live cursors, presence, simultaneous editing

## Requirements

- Node.js 20+ (tested on Node 24)

## Development

```
npm install
npm run dev
```

- Client: http://localhost:5173 (Vite, hot reload)
- API server: http://127.0.0.1:3001

## Daily use (production mode)

```
npm start
```

Builds the client and serves everything from http://127.0.0.1:3001 — or double-click `MorphBoards.cmd`.

## Sharing & collaboration

Open a board → share button (top right) → create a link per role
(read-only / comment-only / editor). Anyone opening a link joins the
board live: cursors, selections and edits sync in real time. Guests
pick a display name (remembered in their browser) that labels their
cursor and comments. Revoking a link disconnects its users instantly.

By default the server only listens on this machine. To let other
devices on your network use share links:

```
MORPH_HOST=0.0.0.0 npm start
```

(On Windows PowerShell: `$env:MORPH_HOST='0.0.0.0'; npm start`.)
Links are unguessable 128-bit tokens; the share dialog builds them
with your LAN address automatically.

## Data

All data lives in `server/data/`:

- `morphboards.db` — SQLite database of boards
- `assets/<boardId>/` — uploaded images
- `thumbnails/` — board thumbnails

Back up a single board via Export (zip) in the UI, or copy the whole `server/data/` folder.
