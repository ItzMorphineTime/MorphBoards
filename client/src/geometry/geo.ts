export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Rect from two arbitrary corner points (always positive size). */
export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

export function rectContainsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function expandRect(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, width: r.width + m * 2, height: r.height + m * 2 };
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ---------------------------------------------------------------------------
// Viewport math. screen = world * zoom + pan

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 4;

export function screenToWorld(vp: ViewportState, p: Point): Point {
  return { x: (p.x - vp.x) / vp.zoom, y: (p.y - vp.y) / vp.zoom };
}

export function worldToScreen(vp: ViewportState, p: Point): Point {
  return { x: p.x * vp.zoom + vp.x, y: p.y * vp.zoom + vp.y };
}

export function worldRectToScreen(vp: ViewportState, r: Rect): Rect {
  return {
    x: r.x * vp.zoom + vp.x,
    y: r.y * vp.zoom + vp.y,
    width: r.width * vp.zoom,
    height: r.height * vp.zoom,
  };
}

/** New viewport that keeps the world point under `screenPt` fixed while zooming. */
export function zoomAt(vp: ViewportState, screenPt: Point, newZoom: number): ViewportState {
  const zoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
  const world = screenToWorld(vp, screenPt);
  return { x: screenPt.x - world.x * zoom, y: screenPt.y - world.y * zoom, zoom };
}

/** Viewport that fits `bounds` into a screen of the given size with padding. */
export function fitViewport(
  bounds: Rect,
  screenWidth: number,
  screenHeight: number,
  padding = 64,
): ViewportState {
  const w = Math.max(bounds.width, 1);
  const h = Math.max(bounds.height, 1);
  const zoom = clamp(
    Math.min((screenWidth - padding * 2) / w, (screenHeight - padding * 2) / h),
    MIN_ZOOM,
    1.5,
  );
  const c = rectCenter(bounds);
  return { x: screenWidth / 2 - c.x * zoom, y: screenHeight / 2 - c.y * zoom, zoom };
}
