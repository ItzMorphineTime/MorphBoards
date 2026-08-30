import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import archiver from 'archiver';
import * as unzipper from 'unzipper';
import type { FastifyInstance } from 'fastify';
import { type BoardDoc, newId, type ShareRole } from '@morphboards/shared';
import { googleEnabled, issueGuest, readGuest, requireCap, resolveActor } from './auth';
import * as db from './db';
import { assetsDir, boardAssetsDir, thumbnailPath, tmpDir } from './paths';
import { getActiveDoc, kickShare, renameActiveRoom } from './realtime';

const SHARE_ROLES: ShareRole[] = ['viewer', 'commenter', 'editor'];

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/tiff': 'tif',
};

function extFor(mimetype: string, filename: string): string {
  const fromMime = MIME_EXT[mimetype];
  if (fromMime) return fromMime;
  const fromName = path.extname(filename).slice(1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(fromName) ? fromName : 'bin';
}

function isValidDoc(doc: unknown): doc is BoardDoc {
  if (typeof doc !== 'object' || doc === null) return false;
  const d = doc as BoardDoc;
  return (
    typeof d.elements === 'object' &&
    d.elements !== null &&
    Array.isArray(d.order) &&
    typeof d.connectors === 'object' &&
    d.connectors !== null
  );
}

function thumbnailUrl(boardId: string): string | null {
  const p = thumbnailPath(boardId);
  try {
    const stat = fs.statSync(p);
    return `/thumbnails/${boardId}.png?v=${Math.round(stat.mtimeMs)}`;
  } catch {
    return null;
  }
}

function writeThumbnail(boardId: string, dataUrl: string): void {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) return;
  fs.writeFileSync(thumbnailPath(boardId), Buffer.from(match[1], 'base64'));
}

/** Rewrite asset URLs when a doc moves to a new board id (duplicate/import). */
function rewriteAssetUrls(doc: BoardDoc, oldId: string, newBoardId: string): BoardDoc {
  const json = JSON.stringify(doc).split(`/files/${oldId}/`).join(`/files/${newBoardId}/`);
  return JSON.parse(json) as BoardDoc;
}

export function registerRoutes(app: FastifyInstance): void {
  app.get('/api/health', async () => ({ ok: true }));

  // ---------------------------------------------------------------- identity

  app.get('/api/me', async (req) => ({
    actor: resolveActor(req),
    googleEnabled: googleEnabled(),
  }));

  app.post('/api/identity', async (req, reply) => {
    const body = (req.body ?? {}) as { name?: string };
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return reply.code(400).send({ error: 'Missing name' });
    }
    const existing = readGuest(req);
    const identity = issueGuest(reply, body.name, existing?.id);
    return { ok: true, name: identity.name };
  });

  // ------------------------------------------------------------------ boards

  app.get('/api/boards', async (req, reply) => {
    if (!requireCap(req, reply, '*', 'owner')) return reply;
    return db.listBoards().map((meta) => ({ ...meta, thumbnailUrl: thumbnailUrl(meta.id) }));
  });

  app.post('/api/boards', async (req, reply) => {
    if (!requireCap(req, reply, '*', 'owner')) return reply;
    const body = (req.body ?? {}) as { name?: string };
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled board';
    return db.createBoard(name);
  });

  app.get('/api/boards/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!requireCap(req, reply, id, 'owner')) return reply;
    const board = db.getBoard(id);
    if (!board) return reply.code(404).send({ error: 'Board not found' });
    const live = getActiveDoc(id);
    return live ? { ...board, doc: live } : board;
  });

  app.put('/api/boards/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!requireCap(req, reply, id, 'owner')) return reply;
    const body = req.body as { doc?: unknown; thumbnail?: string };
    if (!isValidDoc(body?.doc)) return reply.code(400).send({ error: 'Invalid board doc' });
    const updatedAt = db.saveDoc(id, body.doc);
    if (updatedAt === null) return reply.code(404).send({ error: 'Board not found' });
    if (typeof body.thumbnail === 'string') writeThumbnail(id, body.thumbnail);
    return { updatedAt };
  });

  app.patch('/api/boards/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!requireCap(req, reply, id, 'owner')) return reply;
    const body = req.body as { name?: string };
    if (typeof body?.name !== 'string' || !body.name.trim()) {
      return reply.code(400).send({ error: 'Missing name' });
    }
    if (!db.renameBoard(id, body.name.trim())) return reply.code(404).send({ error: 'Board not found' });
    renameActiveRoom(id, body.name.trim());
    return { ok: true };
  });

  app.delete('/api/boards/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!requireCap(req, reply, id, 'owner')) return reply;
    if (!db.deleteBoard(id)) return reply.code(404).send({ error: 'Board not found' });
    fs.rmSync(boardAssetsDir(id), { recursive: true, force: true });
    fs.rmSync(thumbnailPath(id), { force: true });
    return { ok: true };
  });

  app.post('/api/boards/:id/duplicate', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!requireCap(req, reply, id, 'owner')) return reply;
    const source = db.getBoard(id);
    if (!source) return reply.code(404).send({ error: 'Board not found' });
    const copyId = newId();
    const srcAssets = boardAssetsDir(id);
    if (fs.existsSync(srcAssets)) {
      fs.cpSync(srcAssets, boardAssetsDir(copyId), { recursive: true });
    }
    const doc = rewriteAssetUrls(source.doc, id, copyId);
    return db.insertBoard(copyId, `${source.name} (copy)`, doc);
  });

  // ------------------------------------------------------------------ assets

  app.post('/api/boards/:id/assets', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!requireCap(req, reply, id, 'editor')) return reply;
    if (!db.boardExists(id)) return reply.code(404).send({ error: 'Board not found' });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'No file uploaded' });

    const assetId = newId();
    const ext = extFor(file.mimetype, file.filename ?? '');
    const dir = boardAssetsDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${assetId}.${ext}`;
    await pipeline(file.file, createWriteStream(path.join(dir, filename)));
    if (file.file.truncated) {
      fs.rmSync(path.join(dir, filename), { force: true });
      return reply.code(413).send({ error: 'File too large' });
    }
    return { assetId, url: `/files/${id}/${filename}` };
  });

  /**
   * Copy an existing asset (usually from another board) into this board's
   * folder — used when pasting image elements across boards so every board
   * owns the files it references.
   */
  app.post('/api/boards/:id/assets/copy', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!requireCap(req, reply, id, 'editor')) return reply;
    if (!db.boardExists(id)) return reply.code(404).send({ error: 'Board not found' });
    const body = (req.body ?? {}) as { sourceUrl?: string };
    const match = /^\/files\/([\w-]+)\/([\w.-]+)$/.exec(body.sourceUrl ?? '');
    if (!match) return reply.code(400).send({ error: 'Invalid sourceUrl' });
    const [, srcBoard, name] = match;
    const srcPath = path.join(assetsDir, srcBoard, name);
    if (!fs.existsSync(srcPath)) return reply.code(404).send({ error: 'Source asset not found' });

    const ext = path.extname(name).slice(1).toLowerCase() || 'bin';
    const assetId = newId();
    const dir = boardAssetsDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${assetId}.${ext}`;
    fs.copyFileSync(srcPath, path.join(dir, filename));
    return { assetId, url: `/files/${id}/${filename}` };
  });

  // ------------------------------------------------------------------ shares

  app.get('/api/boards/:id/shares', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!requireCap(req, reply, id, 'owner')) return reply;
    return db.listShares(id);
  });

  app.post('/api/boards/:id/shares', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!requireCap(req, reply, id, 'owner')) return reply;
    if (!db.boardExists(id)) return reply.code(404).send({ error: 'Board not found' });
    const body = (req.body ?? {}) as { role?: string };
    if (!SHARE_ROLES.includes(body.role as ShareRole)) {
      return reply.code(400).send({ error: 'Invalid role' });
    }
    return db.createShare(id, body.role as ShareRole);
  });

  app.delete('/api/shares/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const share = db.getShare(token);
    if (!share) return reply.code(404).send({ error: 'Share not found' });
    if (!requireCap(req, reply, share.boardId, 'owner')) return reply;
    db.revokeShare(token);
    kickShare(token);
    return { ok: true };
  });

  /** Guest entry point: resolve a share link to board meta + role (+ doc fallback). */
  app.get('/api/shared/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const share = db.getShare(token);
    if (!share || share.revokedAt !== null) {
      return reply.code(404).send({ error: 'This share link is invalid or was revoked' });
    }
    const board = db.getBoard(share.boardId);
    if (!board) return reply.code(404).send({ error: 'Board not found' });
    const live = getActiveDoc(share.boardId);
    return {
      board: { id: board.id, name: board.name },
      role: share.role,
      doc: live ?? board.doc,
    };
  });

  /** LAN addresses for building copyable share links in local mode. */
  app.get('/api/server-info', async (req, reply) => {
    if (!requireCap(req, reply, '*', 'owner')) return reply;
    const hosts: string[] = [];
    for (const infos of Object.values(os.networkInterfaces())) {
      for (const info of infos ?? []) {
        if (info.family === 'IPv4' && !info.internal) hosts.push(info.address);
      }
    }
    const port = Number(process.env.MORPH_PORT ?? 3001);
    return { port, hosts, bound: process.env.MORPH_HOST ?? '127.0.0.1' };
  });

  app.post('/api/boards/:id/thumbnail', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!requireCap(req, reply, id, 'editor')) return reply;
    const body = (req.body ?? {}) as { dataUrl?: string };
    if (typeof body.dataUrl === 'string') writeThumbnail(id, body.dataUrl);
    return { ok: true };
  });

  // ----------------------------------------------------------- export/import

  app.get('/api/boards/:id/export', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!requireCap(req, reply, id, 'editor')) return reply;
    const board = db.getBoard(id);
    if (!board) return reply.code(404).send({ error: 'Board not found' });

    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.append(
      JSON.stringify({ morphboards: 1, meta: { id: board.id, name: board.name }, doc: board.doc }, null, 2),
      { name: 'board.json' },
    );
    const assets = boardAssetsDir(id);
    if (fs.existsSync(assets)) archive.directory(assets, 'assets');
    void archive.finalize();

    const safeName = board.name.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'board';
    reply
      .type('application/zip')
      .header('content-disposition', `attachment; filename="${safeName}.morphboard.zip"`);
    return reply.send(archive);
  });

  app.post('/api/import', async (req, reply) => {
    if (!requireCap(req, reply, '*', 'owner')) return reply;
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'No file uploaded' });

    const tmpPath = path.join(tmpDir, `${newId()}.zip`);
    await pipeline(file.file, createWriteStream(tmpPath));
    try {
      const zip = await unzipper.Open.file(tmpPath);
      const boardEntry = zip.files.find((f) => f.path === 'board.json');
      if (!boardEntry) return reply.code(400).send({ error: 'Not a MorphBoards export (board.json missing)' });

      const parsed = JSON.parse((await boardEntry.buffer()).toString('utf8')) as {
        morphboards?: number;
        meta?: { id?: string; name?: string };
        doc?: unknown;
      };
      if (parsed.morphboards !== 1 || !isValidDoc(parsed.doc)) {
        return reply.code(400).send({ error: 'Invalid MorphBoards export' });
      }

      const id = newId();
      const dir = boardAssetsDir(id);
      fs.mkdirSync(dir, { recursive: true });
      for (const entry of zip.files) {
        if (entry.type !== 'File') continue;
        const entryPath = entry.path.replace(/\\/g, '/');
        if (!entryPath.startsWith('assets/')) continue;
        const name = path.basename(entryPath);
        if (!/^[\w.-]+$/.test(name)) continue; // zip-slip guard
        await pipeline(entry.stream(), createWriteStream(path.join(dir, name)));
      }

      const oldId = parsed.meta?.id ?? '';
      const doc = oldId ? rewriteAssetUrls(parsed.doc, oldId, id) : parsed.doc;
      const name = typeof parsed.meta?.name === 'string' ? parsed.meta.name : 'Imported board';
      return db.insertBoard(id, name, doc);
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }
  });
}
