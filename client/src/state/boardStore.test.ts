import { beforeEach, describe, expect, it } from 'vitest';
import type { CommentElement, Connector, ShapeElement } from '@morphboards/shared';
import { emptyBoardDoc } from '@morphboards/shared';
import { useBoardStore } from './boardStore';

function shape(id: string, x = 0, y = 0): ShapeElement {
  return {
    id,
    type: 'shape',
    x,
    y,
    width: 100,
    height: 60,
    kind: 'rect',
    fill: '#000',
    stroke: '#fff',
    strokeWidth: 1,
    opacity: 1,
    text: '',
    textStyle: { fontSize: 16, color: '#fff', align: 'center', bold: false },
  };
}

function connector(id: string, fromId: string, toId: string): Connector {
  return {
    id,
    from: { kind: 'element', elementId: fromId, side: 'auto' },
    to: { kind: 'element', elementId: toId, side: 'auto' },
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
});

describe('boardStore history', () => {
  it('add → undo → redo round-trips', () => {
    store().addElements([shape('a')]);
    expect(store().elements.a).toBeDefined();
    expect(store().order).toEqual(['a']);
    store().undo();
    expect(store().elements.a).toBeUndefined();
    expect(store().order).toEqual([]);
    store().redo();
    expect(store().elements.a).toBeDefined();
  });

  it('update patches merge and undo restores the previous value', () => {
    store().addElements([shape('a', 5, 5)]);
    store().updateElements({ a: { x: 50 } });
    expect(store().elements.a.x).toBe(50);
    expect(store().elements.a.y).toBe(5);
    store().undo();
    expect(store().elements.a.x).toBe(5);
  });

  it('removing an element also removes its connectors, restorable by undo', () => {
    store().addElements([shape('a'), shape('b', 300)]);
    store().addConnectors([connector('c1', 'a', 'b')]);
    store().removeElements(['a']);
    expect(store().elements.a).toBeUndefined();
    expect(store().connectors.c1).toBeUndefined();
    store().undo();
    expect(store().elements.a).toBeDefined();
    expect(store().connectors.c1).toBeDefined();
  });

  it('deleting a frame unparents children and detaches pins', () => {
    const f = { ...shape('f'), type: 'frame', title: 'F', fill: '#111' } as unknown as ShapeElement;
    const child = shape('kid', 10, 10);
    child.frameId = 'f';
    const pin: CommentElement = {
      id: 'pin',
      type: 'comment',
      x: 0,
      y: 0,
      width: 32,
      height: 32,
      attachedTo: 'f',
      messages: [],
      resolved: false,
    };
    store().addElements([f, child, pin]);
    store().removeElements(['f']);
    expect(store().elements.kid.frameId).toBeNull();
    expect((store().elements.pin as CommentElement).attachedTo).toBeNull();
    store().undo();
    expect(store().elements.kid.frameId).toBe('f');
    expect((store().elements.pin as CommentElement).attachedTo).toBe('f');
  });

  it('transient drags coalesce into one history entry', () => {
    store().addElements([shape('a')]);
    const undoBefore = store().undoStack.length;
    store().beginTransient(['a']);
    store().applyTransient({ a: { x: 10 } });
    store().applyTransient({ a: { x: 20 } });
    store().applyTransient({ a: { x: 30 } });
    store().endTransient();
    expect(store().elements.a.x).toBe(30);
    expect(store().undoStack.length).toBe(undoBefore + 1);
    store().undo();
    expect(store().elements.a.x).toBe(0);
  });

  it('cancelTransient restores the pre-drag state without history', () => {
    store().addElements([shape('a')]);
    const undoBefore = store().undoStack.length;
    store().beginTransient(['a']);
    store().applyTransient({ a: { x: 99 } });
    store().cancelTransient();
    expect(store().elements.a.x).toBe(0);
    expect(store().undoStack.length).toBe(undoBefore);
  });

  it('endTransient applies extra patches (frame adoption) into the same entry', () => {
    store().addElements([shape('a')]);
    store().beginTransient(['a']);
    store().applyTransient({ a: { x: 500 } });
    store().endTransient({ a: { frameId: 'some-frame' } });
    expect(store().elements.a.frameId).toBe('some-frame');
    store().undo();
    expect(store().elements.a.frameId).toBeUndefined();
    expect(store().elements.a.x).toBe(0);
  });

  it('addMany creates a single undo step for elements + connectors + patches', () => {
    store().addElements([shape('x')]);
    const undoBefore = store().undoStack.length;
    store().addMany([shape('a'), shape('b', 300)], [connector('c1', 'a', 'b')], {
      x: { frameId: null },
    });
    expect(store().undoStack.length).toBe(undoBefore + 1);
    store().undo();
    expect(store().elements.a).toBeUndefined();
    expect(store().connectors.c1).toBeUndefined();
    expect(store().elements.x).toBeDefined();
  });

  it('reorder front/back/forward/backward', () => {
    store().addElements([shape('a'), shape('b'), shape('c')]);
    expect(store().order).toEqual(['a', 'b', 'c']);
    store().reorder(['a'], 'front');
    expect(store().order).toEqual(['b', 'c', 'a']);
    store().reorder(['a'], 'backward');
    expect(store().order).toEqual(['b', 'a', 'c']);
    store().reorder(['c'], 'back');
    expect(store().order).toEqual(['c', 'b', 'a']);
    store().undo();
    expect(store().order).toEqual(['b', 'a', 'c']);
  });

  it('frames are added at the start of the order (rendered behind)', () => {
    store().addElements([shape('a')]);
    const f = { ...shape('f'), type: 'frame', title: 'F', fill: '#111' } as unknown as ShapeElement;
    store().addElements([f]);
    expect(store().order).toEqual(['f', 'a']);
  });
});
