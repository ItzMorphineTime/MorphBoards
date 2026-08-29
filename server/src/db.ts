import path from 'node:path';
import Database from 'better-sqlite3';
import {
  type BoardDoc,
  type BoardMeta,
  type BoardWithDoc,
  emptyBoardDoc,
  newId,
} from '@morphboards/shared';
import { dataDir, ensureDataDirs } from './paths';

ensureDataDirs();

const db = new Database(path.join(dataDir, 'morphboards.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    doc TEXT NOT NULL
  )
`);

interface BoardRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  doc: string;
}

function rowToMeta(row: BoardRow): BoardMeta {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function listBoards(): BoardMeta[] {
  const rows = db
    .prepare('SELECT id, name, created_at, updated_at FROM boards ORDER BY updated_at DESC')
    .all() as Omit<BoardRow, 'doc'>[];
  return rows.map((r) => rowToMeta({ ...r, doc: '' }));
}

export function getBoard(id: string): BoardWithDoc | null {
  const row = db.prepare('SELECT * FROM boards WHERE id = ?').get(id) as BoardRow | undefined;
  if (!row) return null;
  return { ...rowToMeta(row), doc: JSON.parse(row.doc) as BoardDoc };
}

export function boardExists(id: string): boolean {
  return db.prepare('SELECT 1 FROM boards WHERE id = ?').get(id) !== undefined;
}

export function createBoard(name: string): BoardWithDoc {
  const now = Date.now();
  const board: BoardWithDoc = {
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    doc: emptyBoardDoc(),
  };
  db.prepare('INSERT INTO boards (id, name, created_at, updated_at, doc) VALUES (?, ?, ?, ?, ?)').run(
    board.id,
    board.name,
    now,
    now,
    JSON.stringify(board.doc),
  );
  return board;
}

/** Insert a fully-specified board (used by import and duplicate). */
export function insertBoard(id: string, name: string, doc: BoardDoc): BoardMeta {
  const now = Date.now();
  db.prepare('INSERT INTO boards (id, name, created_at, updated_at, doc) VALUES (?, ?, ?, ?, ?)').run(
    id,
    name,
    now,
    now,
    JSON.stringify(doc),
  );
  return { id, name, createdAt: now, updatedAt: now };
}

export function saveDoc(id: string, doc: BoardDoc): number | null {
  const now = Date.now();
  const res = db
    .prepare('UPDATE boards SET doc = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(doc), now, id);
  return res.changes > 0 ? now : null;
}

export function renameBoard(id: string, name: string): boolean {
  const res = db
    .prepare('UPDATE boards SET name = ?, updated_at = ? WHERE id = ?')
    .run(name, Date.now(), id);
  return res.changes > 0;
}

export function deleteBoard(id: string): boolean {
  return db.prepare('DELETE FROM boards WHERE id = ?').run(id).changes > 0;
}
