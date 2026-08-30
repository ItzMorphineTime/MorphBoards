import { beforeEach, describe, expect, it } from 'vitest';
import type { Connector, FrameElement, ShapeElement } from '@morphboards/shared';
import { emptyBoardDoc } from '@morphboards/shared';
import { useBoardStore } from '../state/boardStore';
import { useUiStore } from '../state/uiStore';
import { carriedConnectorPoints, collectPayload, moveClosure } from './actions';

function shape(id: string, x: number, y: number, frameId?: string): ShapeElement {
  return {
    id,
    type: 'shape',
    x,
    y,
    width: 100,
    height: 60,
    frameId: frameId ?? null,
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

function con(id: string, from: Connector['from'], to: Connector['to']): Connector {
  return {
    id,
    from,
    to,
    routing: 'straight',
    arrowStart: false,
    arrowEnd: true,
    stroke: '#999',
    strokeWidth: 2,
  };
}

const store = () => useBoardStore.getState();

beforeEach(() => {
  store().load({ id: 'b1', name: 'Test', createdAt: 0, updatedAt: 0, doc: emptyBoardDoc() });
  useUiStore.getState().clearSelection();

  store().addElements([frame('f', 0, 0, 500, 500), shape('a', 10, 10, 'f'), shape('z', 900, 900)]);
  store().addConnectors([
    // attached element → free point inside the frame
    con('c1', { kind: 'element', elementId: 'a', side: 'auto' }, { kind: 'point', x: 300, y: 300 }),
    // free point inside → free point outside
    con('c2', { kind: 'point', x: 50, y: 50 }, { kind: 'point', x: 800, y: 800 }),
    // standalone line fully inside the frame
    con('c4', { kind: 'point', x: 100, y: 400 }, { kind: 'point', x: 400, y: 400 }),
    // fully outside
    con('c3', { kind: 'point', x: 700, y: 700 }, { kind: 'point', x: 820, y: 820 }),
  ]);
});

describe('carriedConnectorPoints', () => {
  it('carries free endpoints that sit inside a moving frame', () => {
    const carried = carriedConnectorPoints(moveClosure(['f']));
    const keys = carried.map((c) => `${c.id}:${c.end}`).sort();
    expect(keys).toEqual(['c1:to', 'c2:from', 'c4:from', 'c4:to']);
  });

  it('carries nothing when no frame is moving', () => {
    expect(carriedConnectorPoints(moveClosure(['a']))).toEqual([]);
  });
});

describe('collectPayload with frames', () => {
  it('copies standalone lines contained in a copied frame, not half-out or outside ones', () => {
    useUiStore.getState().setSelection(['f']);
    const payload = collectPayload();
    expect(payload).not.toBeNull();
    const conIds = payload!.connectors.map((c) => c.id).sort();
    // c1: element end copied + point inside; c4: both points inside.
    // c2 leaves the frame, c3 is unrelated.
    expect(conIds).toEqual(['c1', 'c4']);
    expect(payload!.elements.map((e) => e.id).sort()).toEqual(['a', 'f']);
  });

  it('still copies an element-attached arrow to a free point without frames', () => {
    useUiStore.getState().setSelection(['a']);
    const payload = collectPayload();
    expect(payload!.connectors.map((c) => c.id)).toEqual(['c1']);
  });
});

describe('updateMixed', () => {
  it('patches elements and connectors as one undo step', () => {
    const undoBefore = store().undoStack.length;
    store().updateMixed(
      { a: { x: 999 } },
      { c2: { from: { kind: 'point', x: 51, y: 51 } } },
    );
    expect(store().elements.a.x).toBe(999);
    expect(store().connectors.c2.from).toEqual({ kind: 'point', x: 51, y: 51 });
    expect(store().undoStack.length).toBe(undoBefore + 1);
    store().undo();
    expect(store().elements.a.x).toBe(10);
    expect(store().connectors.c2.from).toEqual({ kind: 'point', x: 50, y: 50 });
  });
});
