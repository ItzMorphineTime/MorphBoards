import type { Point, Rect } from './geo';

export type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function isCorner(dir: HandleDir): boolean {
  return dir.length === 2;
}

/**
 * New bounding box when dragging handle `dir` of `start` to world point `cur`.
 * No flipping: edges clamp at `minSize` from their opposite edge.
 * With `aspect` on a corner drag, the start ratio is preserved (anchored at
 * the opposite corner, using the dominant scale axis).
 */
export function computeResizedBox(
  start: Rect,
  dir: HandleDir,
  cur: Point,
  opts: { aspect?: boolean; minSize?: number } = {},
): Rect {
  const min = opts.minSize ?? 8;
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  let nx = start.x;
  let ny = start.y;
  let nr = right;
  let nb = bottom;

  if (dir.includes('w')) nx = Math.min(cur.x, nr - min);
  if (dir.includes('e')) nr = Math.max(cur.x, nx + min);
  if (dir.includes('n')) ny = Math.min(cur.y, nb - min);
  if (dir.includes('s')) nb = Math.max(cur.y, ny + min);

  let box: Rect = { x: nx, y: ny, width: nr - nx, height: nb - ny };

  if (opts.aspect && isCorner(dir) && start.width > 0 && start.height > 0) {
    const sx = box.width / start.width;
    const sy = box.height / start.height;
    const s = Math.abs(Math.log(sx)) >= Math.abs(Math.log(sy)) ? sx : sy;
    const w = Math.max(start.width * s, min);
    const h = Math.max(start.height * s, (min * start.height) / start.width);
    const anchorX = dir.includes('w') ? right : start.x;
    const anchorY = dir.includes('n') ? bottom : start.y;
    box = {
      x: dir.includes('w') ? anchorX - w : anchorX,
      y: dir.includes('n') ? anchorY - h : anchorY,
      width: w,
      height: h,
    };
  }
  return box;
}
