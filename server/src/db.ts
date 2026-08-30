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

db.exec(`
  CREATE TABLE IF NOT EXISTS shares (
    token TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_sub TEXT UNIQUE,
    email TEXT,
    name TEXT,
    avatar TEXT,
    created_at INTEGER NOT NULL
  )
`);

// additive migration: board ownership for hosted mode
{
  const cols = db.prepare('PRAGMA table_info(boards)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'owner_user_id')) {
    db.exec('ALTER TABLE boards ADD COLUMN owner_user_id TEXT');
  }
}

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
  db.prepare('DELETE FROM shares WHERE board_id = ?').run(id);
  return db.prepare('DELETE FROM boards WHERE id = ?').run(id).changes > 0;
}

export function getBoardOwner(id: string): { ownerUserId: string | null } | null {
  const row = db.prepare('SELECT owner_user_id FROM boards WHERE id = ?').get(id) as
    | { owner_user_id: string | null }
    | undefined;
  return row ? { ownerUserId: row.owner_user_id } : null;
}

// ---------------------------------------------------------------------------
// Shares

import type { ShareInfo, ShareRole } from '@morphboards/shared';
import crypto from 'node:crypto';

interface ShareRow {
  token: string;
  board_id: string;
  role: string;
  created_at: number;
  revoked_at: number | null;
}

function rowToShare(r: ShareRow): ShareInfo {
  return {
    token: r.token,
    boardId: r.board_id,
    role: r.role as ShareRole,
    createdAt: r.created_at,
    revokedAt: r.revoked_at,
  };
}

export function createShare(boardId: string, role: ShareRole): ShareInfo {
  const token = crypto.randomBytes(16).toString('hex'); // 128-bit
  const now = Date.now();
  db.prepare('INSERT INTO shares (token, board_id, role, created_at) VALUES (?, ?, ?, ?)').run(
    token,
    boardId,
    role,
    now,
  );
  return { token, boardId, role, createdAt: now, revokedAt: null };
}

export function listShares(boardId: string): ShareInfo[] {
  const rows = db
    .prepare('SELECT * FROM shares WHERE board_id = ? AND revoked_at IS NULL ORDER BY created_at')
    .all(boardId) as ShareRow[];
  return rows.map(rowToShare);
}

export function getShare(token: string): ShareInfo | null {
  const row = db.prepare('SELECT * FROM shares WHERE token = ?').get(token) as ShareRow | undefined;
  return row ? rowToShare(row) : null;
}

export function revokeShare(token: string): boolean {
  return (
    db.prepare('UPDATE shares SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL').run(
      Date.now(),
      token,
    ).changes > 0
  );
}

// ---------------------------------------------------------------------------
// Users (hosted mode)

export interface UserRow {
  id: string;
  google_sub: string | null;
  email: string | null;
  name: string | null;
  avatar: string | null;
}

export function getUser(id: string): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined) ?? null;
}

export function upsertGoogleUser(sub: string, email: string, name: string, avatar: string | null): UserRow {
  const existing = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(sub) as
    | UserRow
    | undefined;
  if (existing) {
    db.prepare('UPDATE users SET email = ?, name = ?, avatar = ? WHERE id = ?').run(
      email,
      name,
      avatar,
      existing.id,
    );
    return { ...existing, email, name, avatar };
  }
  const id = newId();
  db.prepare(
    'INSERT INTO users (id, google_sub, email, name, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, sub, email, name, avatar, Date.now());
  return { id, google_sub: sub, email, name, avatar };
}
