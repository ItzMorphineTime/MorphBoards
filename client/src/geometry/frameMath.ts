import type { Rect } from './geo';

/**
 * Map a child rect when its frame is scaled from `oldFrame` to `newFrame`
 * (positions and sizes scale proportionally with the frame).
 */
export function scaleChildWithFrame(oldFrame: Rect, newFrame: Rect, child: Rect): Rect {
  const sx = oldFrame.width === 0 ? 1 : newFrame.width / oldFrame.width;
  const sy = oldFrame.height === 0 ? 1 : newFrame.height / oldFrame.height;
  return {
    x: newFrame.x + (child.x - oldFrame.x) * sx,
    y: newFrame.y + (child.y - oldFrame.y) * sy,
    width: child.width * sx,
    height: child.height * sy,
  };
}

/** Scale factor to apply to font sizes for a (possibly non-uniform) frame scale. */
export function fontScaleFor(oldFrame: Rect, newFrame: Rect): number {
  const sx = oldFrame.width === 0 ? 1 : newFrame.width / oldFrame.width;
  const sy = oldFrame.height === 0 ? 1 : newFrame.height / oldFrame.height;
  return Math.sqrt(Math.abs(sx * sy));
}
