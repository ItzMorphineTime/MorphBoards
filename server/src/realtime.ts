import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  applyOpToDoc,
  type ActorInfo,
  type BoardDoc,
  type BoardOp,
  type Capability,
  isValidOp,
  newId,
  type OpDoc,
  opAllowedForRole,
  type PeerInfo,
  roleAtLeast,
  SCHEMA_VERSION,
} from '@morphboards/shared';
import { capabilityFor, resolveActor } from './auth';
import * as db from './db';

/** Minimal socket surface (avoids ws version type friction). */
interface Sock {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', fn: (data: Buffer | string) => void): void;
  on(event: 'close', fn: () => void): void;
  on(event: 'error', fn: (err: Error) => void): void;
  readyState: number;
}

interface ClientCtx {
  sock: Sock;
  peerId: string;
  actor: ActorInfo;
  role: Capability;
  shareToken: string | null;
}

interface Room {
  boardId: string;
  name: string;
  doc: OpDoc;
  seq: number;
  clients: Set<ClientCtx>;
  saveTimer: NodeJS.Timeout | null;
  dirty: boolean;
}

const rooms = new Map<string, Room>();

const MAX_MESSAGE_BYTES = 2_000_000;
const OPEN = 1;

function docFromRoom(room: Room): BoardDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    elements: room.doc.elements,
    order: room.doc.order,
    connectors: room.doc.connectors,
  };
}

function getRoom(boardId: string): Room | null {
  const existing = rooms.get(boardId);
  if (existing) return existing;
  const board = db.getBoard(boardId);
  if (!board) return null;
  const room: Room = {
    boardId,
    name: board.name,
    doc: {
      elements: board.doc.elements ?? {},
      order: board.doc.order ?? [],
      connectors: board.doc.connectors ?? {},
    },
    seq: 0,
    clients: new Set(),
    saveTimer: null,
    dirty: false,
  };
  rooms.set(boardId, room);
  return room;
}

/** REST reads must see the live doc while a room is active. */
export function getActiveDoc(boardId: string): BoardDoc | null {
  const room = rooms.get(boardId);
  return room ? docFromRoom(room) : null;
}

export function getActiveRoomName(boardId: string, fallback: string): string {
  return rooms.get(boardId)?.name ?? fallback;
}

export function renameActiveRoom(boardId: string, name: string): void {
  const room = rooms.get(boardId);
  if (room) room.name = name;
}

function flushRoom(room: Room): void {
  if (room.saveTimer) {
    clearTimeout(room.saveTimer);
    room.saveTimer = null;
  }
  if (!room.dirty) return;
  room.dirty = false;
  db.saveDoc(room.boardId, docFromRoom(room));
}

function persistSoon(room: Room): void {
  room.dirty = true;
  if (room.saveTimer) return;
  room.saveTimer = setTimeout(() => {
    room.saveTimer = null;
    flushRoom(room);
  }, 500);
}

export function flushAllRooms(): void {
  for (const room of rooms.values()) flushRoom(room);
}

function send(ctx: ClientCtx, msg: unknown): void {
  if (ctx.sock.readyState === OPEN) ctx.sock.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: unknown, except?: ClientCtx): void {
  const raw = JSON.stringify(msg);
  for (const c of room.clients) {
    if (c !== except && c.sock.readyState === OPEN) c.sock.send(raw);
  }
}

function peersOf(room: Room, except?: ClientCtx): PeerInfo[] {
  return Array.from(room.clients)
    .filter((c) => c !== except)
    .map((c) => ({
      peerId: c.peerId,
      actorId: c.actor.id,
      name: c.actor.name,
      color: c.actor.color,
      role: c.role,
    }));
}

/** Commenter previews may only move comment elements. */
function previewAllowed(
  role: Capability,
  elements: Record<string, unknown> | undefined,
  connectors: Record<string, unknown> | undefined,
  doc: OpDoc,
): boolean {
  if (role === 'owner' || role === 'editor') return true;
  if (role === 'viewer') return false;
  if (connectors && Object.keys(connectors).length > 0) return false;
  if (elements) {
    for (const id of Object.keys(elements)) {
      if (doc.elements[id]?.type !== 'comment') return false;
    }
  }
  return true;
}

interface ClientMessage {
  t: 'op' | 'presence' | 'preview';
  opId?: string;
  op?: BoardOp;
  cursor?: { x: number; y: number } | null;
  selection?: string[];
  elements?: Record<string, Record<string, unknown>>;
  connectors?: Record<string, Record<string, unknown>>;
}

function handleMessage(room: Room, ctx: ClientCtx, msg: ClientMessage): void {
  switch (msg.t) {
    case 'op': {
      if (!msg.op || !isValidOp(msg.op)) {
        send(ctx, { t: 'error', message: 'Malformed op' });
        return;
      }
      if (!opAllowedForRole(msg.op, ctx.role, room.doc)) {
        send(ctx, { t: 'error', message: 'Not allowed for your role' });
        return;
      }
      const { orderChanged } = applyOpToDoc(room.doc, msg.op);
      room.seq += 1;
      persistSoon(room);
      broadcast(room, {
        t: 'op',
        seq: room.seq,
        peerId: ctx.peerId,
        opId: msg.opId,
        op: msg.op,
        order: orderChanged ? room.doc.order : undefined,
      });
      return;
    }
    case 'presence': {
      broadcast(
        room,
        { t: 'presence', peerId: ctx.peerId, cursor: msg.cursor ?? null, selection: msg.selection ?? [] },
        ctx,
      );
      return;
    }
    case 'preview': {
      if (!previewAllowed(ctx.role, msg.elements, msg.connectors, room.doc)) return;
      broadcast(
        room,
        { t: 'preview', peerId: ctx.peerId, elements: msg.elements, connectors: msg.connectors },
        ctx,
      );
      return;
    }
  }
}

/** Disconnect every live connection using a (just revoked) share token. */
export function kickShare(token: string): void {
  for (const room of rooms.values()) {
    for (const ctx of room.clients) {
      if (ctx.shareToken === token) {
        send(ctx, { t: 'kick', reason: 'This share link was revoked' });
        ctx.sock.close(4401, 'revoked');
      }
    }
  }
}

export function registerRealtime(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (connection: unknown, req: FastifyRequest) => {
    // @fastify/websocket v11 passes the WebSocket directly; older versions
    // pass a stream object with .socket
    const maybe = connection as { socket?: Sock } & Sock;
    const sock: Sock = maybe.socket ?? maybe;

    const q = req.query as { board?: string; share?: string };
    const shareToken = q.share ?? undefined;
    // guests connect with just their token; the share names the board
    const boardId = q.board ?? (shareToken ? (db.getShare(shareToken)?.boardId ?? '') : '');
    const role = capabilityFor(req, boardId, shareToken);
    if (!boardId || !roleAtLeast(role, 'viewer')) {
      sock.close(4403, 'forbidden');
      return;
    }
    const room = getRoom(boardId);
    if (!room) {
      sock.close(4404, 'board not found');
      return;
    }
    const actor: ActorInfo = resolveActor(req) ?? {
      id: `guest:anon-${newId()}`,
      kind: 'guest',
      name: 'Guest',
      color: '#9aa3b8',
    };

    const ctx: ClientCtx = {
      sock,
      peerId: `${actor.id}#${newId().slice(0, 4)}`,
      actor,
      role: role!,
      shareToken: shareToken ?? null,
    };
    room.clients.add(ctx);

    send(ctx, {
      t: 'snapshot',
      seq: room.seq,
      board: { id: room.boardId, name: room.name },
      doc: docFromRoom(room),
      self: { peerId: ctx.peerId, actor, role: ctx.role },
      peers: peersOf(room, ctx),
    });
    broadcast(
      room,
      {
        t: 'peer-join',
        peer: {
          peerId: ctx.peerId,
          actorId: actor.id,
          name: actor.name,
          color: actor.color,
          role: ctx.role,
        } satisfies PeerInfo,
      },
      ctx,
    );

    sock.on('message', (data: Buffer | string) => {
      const raw = typeof data === 'string' ? data : data.toString('utf8');
      if (raw.length > MAX_MESSAGE_BYTES) return;
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw) as ClientMessage;
      } catch {
        return;
      }
      try {
        handleMessage(room, ctx, msg);
      } catch (err) {
        console.error('realtime message error', err);
      }
    });
    sock.on('error', () => undefined);
    sock.on('close', () => {
      room.clients.delete(ctx);
      broadcast(room, { t: 'peer-leave', peerId: ctx.peerId });
      if (room.clients.size === 0) {
        flushRoom(room);
        rooms.delete(room.boardId);
      }
    });
  });
}
