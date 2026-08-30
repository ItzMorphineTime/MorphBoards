import { describe, expect, it } from 'vitest';
import {
  applyOpToDoc,
  type BoardElement,
  type DocDiff,
  invertDiff,
  mergeOrderSet,
  opAllowedForRole,
  opFromDiff,
  type OpDoc,
} from '@morphboards/shared';

function shape(id: string, x = 0): BoardElement {
  return {
    id,
    type: 'shape',
    x,
    y: 0,
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

function pin(id: string): BoardElement {
  return {
    id,
    type: 'comment',
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    messages: [],
    resolved: false,
  };
}

function frameEl(id: string): BoardElement {
  return { id, type: 'frame', x: 0, y: 0, width: 500, height: 500, title: id, fill: '#111' };
}

function doc(els: BoardElement[]): OpDoc {
  return {
    elements: Object.fromEntries(els.map((e) => [e.id, e])),
    order: els.map((e) => e.id),
    connectors: {},
  };
}

describe('opFromDiff', () => {
  it('adds become order intents (frames at the start)', () => {
    const diff: DocDiff = {
      elements: { f: { before: null, after: frameEl('f') }, a: { before: null, after: shape('a') } },
      order: { before: ['x'], after: ['f', 'x', 'a'] },
    };
    const op = opFromDiff(diff);
    expect(op.orderAdd).toEqual(
      expect.arrayContaining([
        { id: 'f', at: 'start' },
        { id: 'a', at: 'end' },
      ]),
    );
    expect(op.orderSet).toBeUndefined();
  });

  it('pure reorders become orderSet', () => {
    const op = opFromDiff({ order: { before: ['a', 'b', 'c'], after: ['b', 'a', 'c'] } });
    expect(op.orderSet).toEqual(['b', 'a', 'c']);
    expect(op.orderAdd).toBeUndefined();
  });

  it('removals become orderRemove', () => {
    const op = opFromDiff({
      elements: { a: { before: shape('a'), after: null } },
      order: { before: ['a', 'b'], after: ['b'] },
    });
    expect(op.orderRemove).toEqual(['a']);
  });
});

describe('applyOpToDoc', () => {
  it('applies element diffs last-write-wins and reconciles order', () => {
    const d = doc([shape('a'), shape('b')]);
    applyOpToDoc(d, {
      elements: {
        a: { before: shape('a'), after: shape('a', 999) },
        c: { before: null, after: shape('c') },
      },
      orderAdd: [{ id: 'c', at: 'end' }],
    });
    expect(d.elements.a.x).toBe(999);
    expect(d.order).toEqual(['a', 'b', 'c']);
  });

  it('keeps concurrently-added ids when an orderSet arrives', () => {
    const d = doc([shape('a'), shape('b'), shape('z')]);
    // a reorder computed before 'z' existed
    const { orderChanged } = applyOpToDoc(d, { orderSet: ['b', 'a'] });
    expect(orderChanged).toBe(true);
    expect(d.order).toEqual(['b', 'a', 'z']);
  });

  it('self-heals order when element diffs and intents disagree', () => {
    const d = doc([shape('a')]);
    // element added without an explicit order intent
    applyOpToDoc(d, { elements: { n: { before: null, after: shape('n') } } });
    expect(d.order).toContain('n');
    // element deleted without orderRemove
    applyOpToDoc(d, { elements: { a: { before: shape('a'), after: null } } });
    expect(d.order).not.toContain('a');
  });
});

describe('invertDiff', () => {
  it('swaps before/after so an undo op reverses the change', () => {
    const diff: DocDiff = {
      elements: { a: { before: null, after: shape('a') } },
      order: { before: [], after: ['a'] },
    };
    const d = doc([]);
    applyOpToDoc(d, opFromDiff(diff));
    expect(d.elements.a).toBeDefined();
    applyOpToDoc(d, opFromDiff(invertDiff(diff)));
    expect(d.elements.a).toBeUndefined();
    expect(d.order).toEqual([]);
  });
});

describe('opAllowedForRole', () => {
  const d = doc([shape('s1'), pin('c1')]);

  it('viewer can do nothing', () => {
    expect(opAllowedForRole({ elements: { c1: { before: d.elements.c1, after: d.elements.c1 } } }, 'viewer', d)).toBe(
      false,
    );
  });

  it('commenter can touch comment elements only', () => {
    const commentOp = {
      elements: { c1: { before: d.elements.c1, after: { ...d.elements.c1, x: 50 } } },
    };
    const shapeOp = {
      elements: { s1: { before: d.elements.s1, after: { ...d.elements.s1, x: 50 } } },
    };
    expect(opAllowedForRole(commentOp, 'commenter', d)).toBe(true);
    expect(opAllowedForRole(shapeOp, 'commenter', d)).toBe(false);
    expect(opAllowedForRole({ orderSet: ['s1', 'c1'] }, 'commenter', d)).toBe(false);
    expect(
      opAllowedForRole(
        { elements: { n: { before: null, after: pin('n') } }, orderAdd: [{ id: 'n', at: 'end' as const }] },
        'commenter',
        d,
      ),
    ).toBe(true);
  });

  it('editor and owner can do everything', () => {
    const op = { orderSet: ['c1', 's1'] };
    expect(opAllowedForRole(op, 'editor', d)).toBe(true);
    expect(opAllowedForRole(op, 'owner', d)).toBe(true);
  });
});

describe('mergeOrderSet', () => {
  it('drops vanished ids and appends concurrent ones', () => {
    expect(mergeOrderSet(['a', 'b', 'new'], ['b', 'gone', 'a'])).toEqual(['b', 'a', 'new']);
  });
});
