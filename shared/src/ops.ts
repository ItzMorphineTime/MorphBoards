import type { BoardElement, Capability, Connector } from './types';

export interface ElementDiff {
  before: BoardElement | null;
  after: BoardElement | null;
}
export interface ConnectorDiff {
  before: Connector | null;
  after: Connector | null;
}

/**
 * A document mutation expressed as before/after diffs. The client's undo
 * history entries use exactly this shape.
 */
export interface DocDiff {
  elements?: Record<string, ElementDiff>;
  connectors?: Record<string, ConnectorDiff>;
  order?: { before: string[]; after: string[] };
}

/**
 * Wire format for a mutation. Element/connector changes are last-write-wins
 * diffs; the render order travels as INTENTS (add/remove/set) because the
 * server keeps the canonical order array and echoes it back after applying.
 */
export interface BoardOp {
  elements?: Record<string, ElementDiff>;
  connectors?: Record<string, ConnectorDiff>;
  /** ids newly added to the render order ('start' = behind everything: frames) */
  orderAdd?: { id: string; at: 'start' | 'end' }[];
  orderRemove?: string[];
  /** explicit z-reorder; merged against concurrent membership changes */
  orderSet?: string[];
}

/** The mutable document shape ops apply to (client store and server room). */
export interface OpDoc {
  elements: Record<string, BoardElement>;
  order: string[];
  connectors: Record<string, Connector>;
}

export function invertDiff(diff: DocDiff): DocDiff {
  const out: DocDiff = {};
  if (diff.elements) {
    out.elements = {};
    for (const [id, d] of Object.entries(diff.elements)) {
      out.elements[id] = { before: d.after, after: d.before };
    }
  }
  if (diff.connectors) {
    out.connectors = {};
    for (const [id, d] of Object.entries(diff.connectors)) {
      out.connectors[id] = { before: d.after, after: d.before };
    }
  }
  if (diff.order) {
    out.order = { before: diff.order.after, after: diff.order.before };
  }
  return out;
}

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Convert a local history diff into the wire op. */
export function opFromDiff(diff: DocDiff): BoardOp {
  const op: BoardOp = {};
  if (diff.elements && Object.keys(diff.elements).length > 0) op.elements = diff.elements;
  if (diff.connectors && Object.keys(diff.connectors).length > 0) op.connectors = diff.connectors;
  if (diff.order) {
    const beforeSet = new Set(diff.order.before);
    const afterSet = new Set(diff.order.after);
    const added = diff.order.after.filter((id) => !beforeSet.has(id));
    const removed = diff.order.before.filter((id) => !afterSet.has(id));
    if (added.length > 0) {
      op.orderAdd = added.map((id) => ({
        id,
        at: diff.elements?.[id]?.after?.type === 'frame' ? 'start' : 'end',
      }));
    }
    if (removed.length > 0) op.orderRemove = removed;
    if (added.length === 0 && removed.length === 0 && !sameArray(diff.order.before, diff.order.after)) {
      op.orderSet = [...diff.order.after];
    }
  }
  return op;
}

/**
 * Merge a requested order against the current one: keep the requested
 * relative order for ids that still exist, preserve concurrently-added ids
 * at their current positions' relative order (appended in current order).
 */
export function mergeOrderSet(current: readonly string[], requested: readonly string[]): string[] {
  const currentSet = new Set(current);
  const requestedSet = new Set(requested);
  const kept = requested.filter((id) => currentSet.has(id));
  const extras = current.filter((id) => !requestedSet.has(id));
  return [...kept, ...extras];
}

/**
 * Apply an op to a document IN PLACE. Self-healing: the order array is
 * reconciled so it always contains exactly the existing element ids.
 * Returns whether the order changed (callers broadcast the canonical order).
 */
export function applyOpToDoc(doc: OpDoc, op: BoardOp): { orderChanged: boolean } {
  const orderBefore = doc.order;

  if (op.elements) {
    for (const [id, d] of Object.entries(op.elements)) {
      if (d.after === null) delete doc.elements[id];
      else doc.elements[id] = d.after;
    }
  }
  if (op.connectors) {
    for (const [id, d] of Object.entries(op.connectors)) {
      if (d.after === null) delete doc.connectors[id];
      else doc.connectors[id] = d.after;
    }
  }

  let order = [...doc.order];
  if (op.orderRemove) {
    const removeSet = new Set(op.orderRemove);
    order = order.filter((id) => !removeSet.has(id));
  }
  if (op.orderAdd) {
    for (const add of op.orderAdd) {
      if (order.includes(add.id)) continue;
      if (add.at === 'start') order.unshift(add.id);
      else order.push(add.id);
    }
  }
  if (op.orderSet) {
    order = mergeOrderSet(order, op.orderSet);
  }
  // reconcile with the element set
  order = order.filter((id) => doc.elements[id] !== undefined);
  const inOrder = new Set(order);
  for (const [id, el] of Object.entries(doc.elements)) {
    if (!inOrder.has(id)) {
      if (el.type === 'frame') order.unshift(id);
      else order.push(id);
    }
  }

  const orderChanged = !sameArray(orderBefore, order);
  doc.order = order;
  return { orderChanged };
}

/**
 * Role filter for incoming ops. Commenters may only touch comment elements
 * (create, move, edit messages, resolve, delete); everything else needs
 * editor or owner capability.
 */
export function opAllowedForRole(op: BoardOp, role: Capability, doc: OpDoc): boolean {
  if (role === 'owner' || role === 'editor') return true;
  if (role === 'viewer') return false;

  // commenter
  if (op.connectors && Object.keys(op.connectors).length > 0) return false;
  if (op.orderSet) return false;
  const isCommentId = (id: string) =>
    op.elements?.[id]?.after?.type === 'comment' ||
    op.elements?.[id]?.before?.type === 'comment' ||
    doc.elements[id]?.type === 'comment';
  if (op.elements) {
    for (const [id, d] of Object.entries(op.elements)) {
      const type = d.after?.type ?? d.before?.type ?? doc.elements[id]?.type;
      if (type !== 'comment') return false;
    }
  }
  if (op.orderAdd && !op.orderAdd.every((a) => isCommentId(a.id))) return false;
  if (op.orderRemove && !op.orderRemove.every(isCommentId)) return false;
  return true;
}

/** Loose structural validation for ops arriving over the wire. */
export function isValidOp(op: unknown): op is BoardOp {
  if (typeof op !== 'object' || op === null) return false;
  const o = op as BoardOp;
  const isRecord = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (o.elements !== undefined && !isRecord(o.elements)) return false;
  if (o.connectors !== undefined && !isRecord(o.connectors)) return false;
  if (o.orderAdd !== undefined && !Array.isArray(o.orderAdd)) return false;
  if (o.orderRemove !== undefined && !Array.isArray(o.orderRemove)) return false;
  if (o.orderSet !== undefined && !Array.isArray(o.orderSet)) return false;
  return true;
}

export function roleAtLeast(role: Capability | null, min: Capability): boolean {
  const rank: Record<Capability, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 };
  return role !== null && rank[role] >= rank[min];
}
