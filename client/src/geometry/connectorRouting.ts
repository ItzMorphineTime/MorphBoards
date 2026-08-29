import type { Attachment, BoardElement, Connector } from '@morphboards/shared';
import { type Point, type Rect, rectCenter } from './geo';

export type Side = 'n' | 'e' | 's' | 'w';

const SIDE_DIR: Record<Side, Point> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};

export function sideMidpoint(r: Rect, side: Side): Point {
  switch (side) {
    case 'n':
      return { x: r.x + r.width / 2, y: r.y };
    case 's':
      return { x: r.x + r.width / 2, y: r.y + r.height };
    case 'w':
      return { x: r.x, y: r.y + r.height / 2 };
    case 'e':
      return { x: r.x + r.width, y: r.y + r.height / 2 };
  }
}

/** Pick the side of `r` facing `toward` (normalized by the rect's extents). */
export function autoSide(r: Rect, toward: Point): Side {
  const c = rectCenter(r);
  const dx = (toward.x - c.x) / Math.max(r.width, 1);
  const dy = (toward.y - c.y) / Math.max(r.height, 1);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'e' : 'w';
  return dy >= 0 ? 's' : 'n';
}

export interface ResolvedEnd {
  point: Point;
  /** Exit direction, when attached to an element side. */
  side: Side | null;
}

export function resolveEnd(
  att: Attachment,
  elements: Record<string, BoardElement>,
  toward: Point,
): ResolvedEnd {
  if (att.kind === 'point') return { point: { x: att.x, y: att.y }, side: null };
  const el = elements[att.elementId];
  if (!el) return { point: toward, side: null };
  const side = att.side === 'auto' ? autoSide(el, toward) : att.side;
  return { point: sideMidpoint(el, side), side };
}

/** Rough anchor used to compute the other end's auto side. */
export function attachmentAnchor(att: Attachment, elements: Record<string, BoardElement>): Point {
  if (att.kind === 'point') return { x: att.x, y: att.y };
  const el = elements[att.elementId];
  return el ? rectCenter(el) : { x: 0, y: 0 };
}

const STUB = 24;

function almostEqual(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    if (out.length > 0 && almostEqual(out[out.length - 1], p)) continue;
    out.push(p);
  }
  // drop collinear middle points (only axis-aligned segments are produced)
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1);
  }
  return out;
}

/** Orthogonal (elbow) route between two resolved ends. */
export function elbowRoute(from: ResolvedEnd, to: ResolvedEnd): Point[] {
  const a = from.point;
  const b = to.point;
  const aSide: Side = from.side ?? autoSideForFree(a, b);
  const bSide: Side = to.side ?? autoSideForFree(b, a);
  const aDir = SIDE_DIR[aSide];
  const bDir = SIDE_DIR[bSide];
  const a2: Point = { x: a.x + aDir.x * STUB, y: a.y + aDir.y * STUB };
  const b2: Point = { x: b.x + bDir.x * STUB, y: b.y + bDir.y * STUB };

  const aH = aDir.x !== 0;
  const bH = bDir.x !== 0;
  let mid: Point[];
  if (aH && bH) {
    const midX = (a2.x + b2.x) / 2;
    mid = [
      { x: midX, y: a2.y },
      { x: midX, y: b2.y },
    ];
  } else if (!aH && !bH) {
    const midY = (a2.y + b2.y) / 2;
    mid = [
      { x: a2.x, y: midY },
      { x: b2.x, y: midY },
    ];
  } else if (aH && !bH) {
    mid = [{ x: b2.x, y: a2.y }];
  } else {
    mid = [{ x: a2.x, y: b2.y }];
  }
  return simplify([a, a2, ...mid, b2, b]);
}

function autoSideForFree(p: Point, toward: Point): Side {
  const dx = toward.x - p.x;
  const dy = toward.y - p.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'e' : 'w';
  return dy >= 0 ? 's' : 'n';
}

/** Full polyline for a connector in world coordinates. */
export function routeConnector(c: Connector, elements: Record<string, BoardElement>): Point[] {
  const fromAnchor = attachmentAnchor(c.from, elements);
  const toAnchor = attachmentAnchor(c.to, elements);
  const from = resolveEnd(c.from, elements, toAnchor);
  const to = resolveEnd(c.to, elements, fromAnchor);
  if (c.routing === 'elbow') return elbowRoute(from, to);
  return [from.point, to.point];
}

/** SVG path with rounded corners for a polyline. */
export function pathD(points: Point[], cornerRadius = 8): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(cornerRadius, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += ` L ${cur.x} ${cur.y}`;
      continue;
    }
    const inDir = { x: (cur.x - prev.x) / inLen, y: (cur.y - prev.y) / inLen };
    const outDir = { x: (next.x - cur.x) / outLen, y: (next.y - cur.y) / outLen };
    const p1 = { x: cur.x - inDir.x * r, y: cur.y - inDir.y * r };
    const p2 = { x: cur.x + outDir.x * r, y: cur.y + outDir.y * r };
    d += ` L ${p1.x} ${p1.y} Q ${cur.x} ${cur.y} ${p2.x} ${p2.y}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

/** Arrowhead triangle at the end of the last segment, pointing along it. */
export function arrowheadPath(points: Point[], atStart: boolean, size: number): string {
  if (points.length < 2) return '';
  const tip = atStart ? points[0] : points[points.length - 1];
  const prev = atStart ? points[1] : points[points.length - 2];
  const len = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
  const dir = { x: (tip.x - prev.x) / len, y: (tip.y - prev.y) / len };
  const perp = { x: -dir.y, y: dir.x };
  const base = { x: tip.x - dir.x * size, y: tip.y - dir.y * size };
  const w = size * 0.55;
  const l = { x: base.x + perp.x * w, y: base.y + perp.y * w };
  const r = { x: base.x - perp.x * w, y: base.y - perp.y * w };
  return `M ${tip.x} ${tip.y} L ${l.x} ${l.y} L ${r.x} ${r.y} Z`;
}

/** Point at half the total length of a polyline (label anchor). */
export function midpointOf(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  let remaining = total / 2;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (seg >= remaining && seg > 0) {
      const t = remaining / seg;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
      };
    }
    remaining -= seg;
  }
  return points[points.length - 1];
}
