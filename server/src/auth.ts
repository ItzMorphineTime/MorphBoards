import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  type ActorInfo,
  type Capability,
  colorForActor,
  newId,
  roleAtLeast,
} from '@morphboards/shared';
import * as db from './db';
import { dataDir } from './paths';

export const GUEST_COOKIE = 'mb_guest';
export const SESSION_COOKIE = 'mb_session';

/** Secret for signed cookies, generated once and kept in the data dir. */
export function getCookieSecret(): string {
  const p = path.join(dataDir, 'secret.key');
  try {
    const existing = fs.readFileSync(p, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // fall through to create
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(p, secret, { mode: 0o600 });
  return secret;
}

export function googleEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function isLoopback(req: FastifyRequest): boolean {
  return req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
}

// ---------------------------------------------------------------------------
// Guest identity (signed cookie)

export interface GuestIdentity {
  id: string;
  name: string;
}

export function readGuest(req: FastifyRequest): GuestIdentity | null {
  const raw = req.cookies?.[GUEST_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  try {
    const parsed = JSON.parse(unsigned.value) as GuestIdentity;
    if (typeof parsed.id === 'string' && typeof parsed.name === 'string') return parsed;
  } catch {
    // invalid cookie
  }
  return null;
}

export function issueGuest(reply: FastifyReply, name: string, existingId?: string): GuestIdentity {
  const identity: GuestIdentity = {
    id: existingId ?? newId(),
    name: name.trim().slice(0, 40) || 'Guest',
  };
  reply.setCookie(GUEST_COOKIE, JSON.stringify(identity), {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return identity;
}

// ---------------------------------------------------------------------------
// Actor + capability resolution

function readSessionUserId(req: FastifyRequest): string | null {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  return unsigned.valid && unsigned.value ? unsigned.value : null;
}

export function resolveActor(req: FastifyRequest): ActorInfo | null {
  const userId = readSessionUserId(req);
  if (userId) {
    const user = db.getUser(userId);
    if (user) {
      const id = `user:${user.id}`;
      return { id, kind: 'user', name: user.name ?? user.email ?? 'User', color: colorForActor(id) };
    }
  }
  // a request arriving through a share link is a guest flow, even from
  // this machine — otherwise share links can't be exercised locally
  const viaShareLink = shareTokenFrom(req) !== null;
  if (!viaShareLink && isLoopback(req)) {
    return { id: 'owner', kind: 'owner', name: 'Owner', color: '#4f8cff' };
  }
  const guest = readGuest(req);
  if (guest) {
    const id = `guest:${guest.id}`;
    return { id, kind: 'guest', name: guest.name, color: colorForActor(id) };
  }
  return null;
}

function shareTokenFrom(req: FastifyRequest, explicit?: string): string | null {
  if (explicit) return explicit;
  const header = req.headers['x-share-token'];
  if (typeof header === 'string' && header) return header;
  const q = req.query as { share?: string };
  return typeof q?.share === 'string' && q.share ? q.share : null;
}

/**
 * What may this request do with this board?
 * - the server machine itself (loopback) and, in hosted mode, the signed-in
 *   owning user are owners;
 * - a valid, unrevoked share token grants its role;
 * - otherwise nothing.
 */
export function capabilityFor(
  req: FastifyRequest,
  boardId: string,
  explicitToken?: string,
): Capability | null {
  const userId = readSessionUserId(req);
  if (userId) {
    const owner = db.getBoardOwner(boardId);
    if (owner && owner.ownerUserId === userId) return 'owner';
  }

  // an explicit share token wins over the loopback heuristic, so links can
  // be tested from the owner's machine with their real role
  const token = shareTokenFrom(req, explicitToken);
  if (token && /^[0-9a-f]{32}$/.test(token)) {
    const share = db.getShare(token);
    if (share && share.boardId === boardId && share.revokedAt === null) return share.role;
    return null;
  }

  if (isLoopback(req)) return 'owner';
  return null;
}

/** Route guard: replies 401/403 and returns null when the capability is insufficient. */
export function requireCap(
  req: FastifyRequest,
  reply: FastifyReply,
  boardId: string,
  min: Capability,
): Capability | null {
  const cap = capabilityFor(req, boardId);
  if (!roleAtLeast(cap, min)) {
    reply.code(cap === null ? 401 : 403).send({ error: 'Not allowed' });
    return null;
  }
  return cap;
}
