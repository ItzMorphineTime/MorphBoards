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

## Data

All data lives in `server/data/`:

- `morphboards.db` — SQLite database of boards
- `assets/<boardId>/` — uploaded images
- `thumbnails/` — board thumbnails

Back up a single board via Export (zip) in the UI, or copy the whole `server/data/` folder.
