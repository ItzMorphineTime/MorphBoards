import { describe, expect, it } from 'vitest';
import { autoSide, elbowRoute, midpointOf, sideMidpoint } from './connectorRouting';
import { fitViewport, normalizeRect, screenToWorld, unionRects, worldToScreen, zoomAt } from './geo';
import { fontScaleFor, scaleChildWithFrame } from './frameMath';
import { elementsInRect, frameAt, topElementAt } from './hitTest';
import { computeResizedBox } from './resizeBox';
import type { BoardElement, FrameElement, ShapeElement } from '@morphboards/shared';

function shape(id: string, x: number, y: number, w: number, h: number): ShapeElement {
  return {
    id,
    type: 'shape',
    x,
    y,
    width: w,
    height: h,
    kind: 'rect',
    fill: '#000',
    stroke: '#fff',
    strokeWidth: 1,
    opacity: 1,
    text: '',
    textStyle: { fontSize: 16, color: '#fff', align: 'center', bold: false },
  };
}

function frame(id: string, x: number, y: number, w: number, h: number): FrameElement {
  return { id, type: 'frame', x, y, width: w, height: h, title: id, fill: '#111' };
}

describe('geo', () => {
  it('normalizes rects from any corner pair', () => {
    expect(normalizeRect({ x: 10, y: 20 }, { x: 4, y: 2 })).toEqual({
      x: 4,
      y: 2,
      width: 6,
      height: 18,
    });
  });

  it('zoomAt keeps the world point under the cursor fixed', () => {
    const vp = { x: 100, y: 50, zoom: 1 };
    const cursor = { x: 400, y: 300 };
    const worldBefore = screenToWorld(vp, cursor);
    const next = zoomAt(vp, cursor, 2);
    const worldAfter = screenToWorld(next, cursor);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
    expect(next.zoom).toBe(2);
  });

  it('round-trips screen and world coords', () => {
    const vp = { x: -230, y: 80, zoom: 0.6 };
    const p = { x: 123, y: -456 };
    expect(screenToWorld(vp, worldToScreen(vp, p)).x).toBeCloseTo(p.x);
  });

  it('fitViewport centers the bounds', () => {
    const vp = fitViewport({ x: 0, y: 0, width: 100, height: 100 }, 1000, 800);
    const center = screenToWorld(vp, { x: 500, y: 400 });
    expect(center.x).toBeCloseTo(50);
    expect(center.y).toBeCloseTo(50);
  });

  it('unions rects', () => {
    expect(
      unionRects([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: -5, width: 10, height: 10 },
      ]),
    ).toEqual({ x: 0, y: -5, width: 30, height: 15 });
  });
});

describe('resizeBox', () => {
  const start = { x: 100, y: 100, width: 200, height: 100 };

  it('drags the se corner', () => {
    expect(computeResizedBox(start, 'se', { x: 400, y: 300 })).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 200,
    });
  });

  it('drags the w edge without touching height', () => {
    const r = computeResizedBox(start, 'w', { x: 50, y: 999 });
    expect(r).toEqual({ x: 50, y: 100, width: 250, height: 100 });
  });

  it('clamps at min size instead of flipping', () => {
    const r = computeResizedBox(start, 'e', { x: -500, y: 0 }, { minSize: 8 });
    expect(r.width).toBe(8);
    expect(r.x).toBe(100);
  });

  it('preserves aspect ratio on corner drags when asked', () => {
    const r = computeResizedBox(start, 'se', { x: 500, y: 150 }, { aspect: true });
    expect(r.width / r.height).toBeCloseTo(2);
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
  });

  it('anchors the opposite corner for nw drags', () => {
    const r = computeResizedBox(start, 'nw', { x: 0, y: 0 });
    expect(r.x + r.width).toBe(300);
    expect(r.y + r.height).toBe(200);
  });
});

describe('frameMath', () => {
  it('scales children with the frame', () => {
    const oldFrame = { x: 0, y: 0, width: 100, height: 100 };
    const newFrame = { x: 50, y: 50, width: 200, height: 100 };
    const child = { x: 10, y: 10, width: 20, height: 20 };
    expect(scaleChildWithFrame(oldFrame, newFrame, child)).toEqual({
      x: 70,
      y: 60,
      width: 40,
      height: 20,
    });
  });

  it('font scale uses geometric mean of the axis scales', () => {
    expect(
      fontScaleFor({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 400, height: 100 }),
    ).toBeCloseTo(2);
  });
});

describe('connectorRouting', () => {
  const box = { x: 0, y: 0, width: 100, height: 50 };

  it('picks the facing side', () => {
    expect(autoSide(box, { x: 300, y: 25 })).toBe('e');
    expect(autoSide(box, { x: -300, y: 25 })).toBe('w');
    expect(autoSide(box, { x: 50, y: 500 })).toBe('s');
    expect(autoSide(box, { x: 50, y: -500 })).toBe('n');
  });

  it('side midpoints sit on the border', () => {
    expect(sideMidpoint(box, 'e')).toEqual({ x: 100, y: 25 });
    expect(sideMidpoint(box, 'n')).toEqual({ x: 50, y: 0 });
  });

  it('elbow routes are orthogonal', () => {
    const route = elbowRoute(
      { point: { x: 0, y: 0 }, side: 'e' },
      { point: { x: 200, y: 100 }, side: 'w' },
    );
    for (let i = 1; i < route.length; i++) {
      const dx = route[i].x - route[i - 1].x;
      const dy = route[i].y - route[i - 1].y;
      expect(dx === 0 || dy === 0).toBe(true);
    }
    expect(route[0]).toEqual({ x: 0, y: 0 });
    expect(route[route.length - 1]).toEqual({ x: 200, y: 100 });
  });

  it('midpoint of a straight segment is its center', () => {
    expect(
      midpointOf([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toEqual({ x: 50, y: 0 });
  });
});

describe('hitTest', () => {
  const f = frame('f1', 0, 0, 500, 500);
  const a = shape('a', 10, 10, 100, 100);
  const b = shape('b', 50, 50, 100, 100);
  const elements: Record<string, BoardElement> = { f1: f, a, b };
  const order = ['f1', 'a', 'b'];

  it('hits the topmost non-frame first', () => {
    expect(topElementAt(elements, order, { x: 60, y: 60 })?.id).toBe('b');
  });

  it('falls back to frames behind elements', () => {
    expect(topElementAt(elements, order, { x: 400, y: 400 })?.id).toBe('f1');
  });

  it('finds frames at a point', () => {
    expect(frameAt(elements, order, { x: 250, y: 250 })?.id).toBe('f1');
    expect(frameAt(elements, order, { x: 250, y: 250 }, new Set(['f1']))).toBeNull();
  });

  it('marquee: intersecting non-frames, fully-contained frames', () => {
    const hit = elementsInRect(elements, order, { x: 0, y: 0, width: 120, height: 120 });
    expect(hit).toContain('a');
    expect(hit).toContain('b');
    expect(hit).not.toContain('f1');
    const all = elementsInRect(elements, order, { x: -10, y: -10, width: 600, height: 600 });
    expect(all).toContain('f1');
  });
});
