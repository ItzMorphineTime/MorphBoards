import type { BoardElement, FrameElement } from '@morphboards/shared';
import { type Point, type Rect, rectContainsPoint, rectContainsRect, rectsIntersect } from './geo';

export interface HitOptions {
  excludeIds?: ReadonlySet<string>;
  includeLocked?: boolean;
}

/**
 * Topmost element at a world point, respecting render order:
 * non-frames (in reverse z order) first, then frames.
 */
export function topElementAt(
  elements: Record<string, BoardElement>,
  order: readonly string[],
  p: Point,
  opts: HitOptions = {},
): BoardElement | null {
  const check = (el: BoardElement | undefined): el is BoardElement => {
    if (!el) return false;
    if (opts.excludeIds?.has(el.id)) return false;
    if (el.locked && !opts.includeLocked) return false;
    return rectContainsPoint(el, p);
  };
  for (let i = order.length - 1; i >= 0; i--) {
    const el = elements[order[i]];
    if (el && el.type !== 'frame' && check(el)) return el;
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const el = elements[order[i]];
    if (el && el.type === 'frame' && check(el)) return el;
  }
  return null;
}

/** Topmost frame containing a world point. */
export function frameAt(
  elements: Record<string, BoardElement>,
  order: readonly string[],
  p: Point,
  excludeIds?: ReadonlySet<string>,
): FrameElement | null {
  for (let i = order.length - 1; i >= 0; i--) {
    const el = elements[order[i]];
    if (!el || el.type !== 'frame') continue;
    if (excludeIds?.has(el.id)) continue;
    if (rectContainsPoint(el, p)) return el;
  }
  return null;
}

/**
 * Elements selected by a marquee rect: non-frames that intersect it,
 * frames only when fully contained.
 */
export function elementsInRect(
  elements: Record<string, BoardElement>,
  order: readonly string[],
  rect: Rect,
): string[] {
  const out: string[] = [];
  for (const id of order) {
    const el = elements[id];
    if (!el || el.locked) continue;
    if (el.type === 'frame') {
      if (rectContainsRect(rect, el)) out.push(id);
    } else if (rectsIntersect(rect, el)) {
      out.push(id);
    }
  }
  return out;
}
