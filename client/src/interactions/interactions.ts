import type { Attachment, BoardElement, TextStyle } from '@morphboards/shared';
import {
  makeComment,
  makeConnector,
  makeFrame,
  makeShape,
  makeSticky,
  makeText,
  DEFAULT_FRAME,
  DEFAULT_SHAPE,
  MIN_SIZE,
} from '../defaults';
import {
  clamp,
  dist,
  normalizeRect,
  type Point,
  type Rect,
  rectCenter,
  unionRects,
} from '../geometry/geo';
import type { Side } from '../geometry/connectorRouting';
import { elementsInRect, frameAt, topElementAt } from '../geometry/hitTest';
import { scaleChildWithFrame, fontScaleFor } from '../geometry/frameMath';
import { computeResizedBox, type HandleDir, isCorner } from '../geometry/resizeBox';
import { frameCount, useBoardStore, type ElementPatch } from '../state/boardStore';
import { useUiStore } from '../state/uiStore';
import { screenToWorldPt, useViewportStore } from '../state/viewportStore';
import {
  type CarriedPoint,
  carriedConnectorPoints,
  carriedPointPatches,
  collectPayload,
  moveClosure,
  pastePayload,
} from './actions';
import { passedThreshold, startPointerSession } from './session';

const board = () => useBoardStore.getState();
const ui = () => useUiStore.getState();
const uiSet = useUiStore.setState;

// ---------------------------------------------------------------------------
// Canvas element registration + coordinates

let canvasEl: HTMLElement | null = null;

export function setCanvasEl(el: HTMLElement | null): void {
  canvasEl = el;
}

export function getCanvasPoint(e: { clientX: number; clientY: number }): Point {
  const rect = canvasEl?.getBoundingClientRect();
  return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
}

export function worldPoint(e: { clientX: number; clientY: number }): Point {
  return screenToWorldPt(getCanvasPoint(e));
}

/** Last known pointer position in world coords (used for paste placement). */
export let lastPointerWorld: Point = { x: 0, y: 0 };

export function trackPointer(e: { clientX: number; clientY: number }): void {
  lastPointerWorld = worldPoint(e);
}

// Hover grace period: connector ports sit slightly outside their element, so
// keep the hover alive briefly while the pointer travels across the gap.
let hoverClearTimer: number | null = null;

export function setHovered(id: string): void {
  if (hoverClearTimer !== null) {
    window.clearTimeout(hoverClearTimer);
    hoverClearTimer = null;
  }
  useUiStore.setState({ hoveredId: id });
}

export function scheduleHoverClear(id: string): void {
  if (hoverClearTimer !== null) window.clearTimeout(hoverClearTimer);
  hoverClearTimer = window.setTimeout(() => {
    hoverClearTimer = null;
    if (ui().hoveredId === id) useUiStore.setState({ hoveredId: null });
  }, 250);
}

export function keepHover(): void {
  if (hoverClearTimer !== null) {
    window.clearTimeout(hoverClearTimer);
    hoverClearTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Pan

export function beginPan(e: { clientX: number; clientY: number; preventDefault?(): void }): void {
  e.preventDefault?.();
  let last = { x: e.clientX, y: e.clientY };
  uiSet({ interaction: 'pan' });
  startPointerSession({
    onMove: (ev) => {
      useViewportStore.getState().panBy(ev.clientX - last.x, ev.clientY - last.y);
      last = { x: ev.clientX, y: ev.clientY };
    },
    onEnd: () => uiSet({ interaction: 'idle' }),
    onCancel: () => uiSet({ interaction: 'idle' }),
  });
}

// ---------------------------------------------------------------------------
// Move drag (elements)

function computeAdoptionPatches(selectionIds: string[], closure: ReadonlySet<string>) {
  const { elements, order } = board();
  const movedFrames = new Set<string>();
  for (const id of closure) {
    const el = elements[id];
    if (el?.type === 'frame') movedFrames.add(id);
  }
  const patches: Record<string, ElementPatch> = {};
  for (const id of selectionIds) {
    const el = elements[id];
    if (!el || el.type === 'frame' || el.type === 'comment') continue;
    const target = frameAt(elements, order, rectCenter(el), movedFrames);
    const targetId = target?.id ?? null;
    if ((el.frameId ?? null) !== targetId) patches[id] = { frameId: targetId };
  }
  return patches;
}

function beginMoveDrag(e: React.PointerEvent, grabbedId: string, onPlainClick?: () => void): void {
  const startScreen = { x: e.clientX, y: e.clientY };
  const startWorld = worldPoint(e);
  const shift = e.shiftKey;
  let selectionIds = ui().selection;
  let closure = moveClosure(selectionIds);
  if (closure.size === 0) return;

  let started = false;
  let startPositions: Record<string, Point> = {};
  let carried: CarriedPoint[] = [];

  const beginDragTransient = () => {
    // free connector endpoints inside a moving frame travel with it
    carried = carriedConnectorPoints(closure);
    board().beginTransient(
      Array.from(closure),
      Array.from(new Set(carried.map((c) => c.id))),
    );
    const { elements } = board();
    startPositions = {};
    for (const id of closure) {
      const el = elements[id];
      if (el) startPositions[id] = { x: el.x, y: el.y };
    }
  };

  startPointerSession({
    onMove: (ev) => {
      trackPointer(ev);
      if (!started) {
        if (!passedThreshold(startScreen, ev)) return;
        started = true;
        if (ev.altKey) {
          // alt-drag duplicates: copy in place and drag the copies instead
          duplicateInPlace();
          selectionIds = ui().selection;
          closure = moveClosure(selectionIds);
        }
        beginDragTransient();
        uiSet({ interaction: 'move' });
      }
      const cur = worldPoint(ev);
      const dx = cur.x - startWorld.x;
      const dy = cur.y - startWorld.y;
      const patches: Record<string, ElementPatch> = {};
      for (const [id, p] of Object.entries(startPositions)) {
        patches[id] = { x: p.x + dx, y: p.y + dy };
      }
      board().applyTransient(
        patches,
        carried.length > 0
          ? carriedPointPatches(carried, (p) => ({ x: p.x + dx, y: p.y + dy }))
          : undefined,
      );

      // frame drop highlight follows the grabbed element's center
      const { elements, order } = board();
      const grabbed = elements[grabbedId];
      let dropFrameId: string | null = null;
      if (grabbed && grabbed.type !== 'frame' && grabbed.type !== 'comment') {
        const movedFrames = new Set(
          Array.from(closure).filter((id) => elements[id]?.type === 'frame'),
        );
        const target = frameAt(elements, order, rectCenter(grabbed), movedFrames);
        dropFrameId = target?.id ?? null;
      }
      uiSet({ dropFrameId });
    },
    onEnd: () => {
      if (!started) {
        if (onPlainClick) onPlainClick();
        else if (!shift && selectionIds.length > 1) ui().setSelection([grabbedId]);
        uiSet({ interaction: 'idle', dropFrameId: null });
        return;
      }
      board().endTransient(computeAdoptionPatches(selectionIds, closure));
      uiSet({ interaction: 'idle', dropFrameId: null });
    },
    onCancel: () => {
      board().cancelTransient();
      uiSet({ interaction: 'idle', dropFrameId: null });
    },
  });
}

// ---------------------------------------------------------------------------
// Resize

export function handleResizeHandleDown(e: React.PointerEvent, dir: HandleDir): void {
  e.stopPropagation();
  e.preventDefault();
  const { elements } = board();
  const selectionIds = ui().selection.filter((id) => elements[id] && !elements[id].locked);
  const els = selectionIds.map((id) => elements[id]);
  if (els.length === 0) return;
  const single = els.length === 1 ? els[0] : null;
  const corner = isCorner(dir);

  // single frame edge drag resizes bounds only; everything else scales contents
  const frameEdgeOnly = single?.type === 'frame' && !corner;
  const closure = frameEdgeOnly ? new Set([single.id]) : moveClosure(selectionIds);

  const startBox = unionRects(els);
  if (!startBox) return;
  const startRects: Record<string, Rect> = {};
  const startFonts: Record<string, TextStyle> = {};
  const startPlainFonts: Record<string, number> = {};
  for (const id of closure) {
    const el = elements[id];
    if (!el) continue;
    startRects[id] = { x: el.x, y: el.y, width: el.width, height: el.height };
    if (el.type === 'text' || el.type === 'shape') startFonts[id] = el.textStyle;
    if ((el.type === 'sticky' || el.type === 'link') && el.fontSize != null) {
      startPlainFonts[id] = el.fontSize;
    }
  }

  const aspectDefault = els.length > 1 || single?.type === 'image';
  // free connector endpoints inside a scaling frame map through the same
  // transform as its children (edge-resize leaves children — and points — put)
  const carried = frameEdgeOnly ? [] : carriedConnectorPoints(closure);
  board().beginTransient(Array.from(closure), Array.from(new Set(carried.map((c) => c.id))));
  uiSet({ interaction: 'resize' });

  startPointerSession({
    onMove: (ev) => {
      const cur = worldPoint(ev);
      const newBox = computeResizedBox(startBox, dir, cur, {
        aspect: aspectDefault || ev.shiftKey,
        minSize: MIN_SIZE,
      });
      const fontScale = corner ? fontScaleFor(startBox, newBox) : 1;
      const patches: Record<string, ElementPatch> = {};
      for (const [id, r0] of Object.entries(startRects)) {
        const el = board().elements[id];
        if (!el) continue;
        if (el.type === 'comment') {
          // pins keep their size; only their center position maps
          const c = rectCenter(r0);
          const mapped = scaleChildWithFrame(startBox, newBox, {
            x: c.x,
            y: c.y,
            width: 0,
            height: 0,
          });
          patches[id] = { x: mapped.x - r0.width / 2, y: mapped.y - r0.height / 2 };
          continue;
        }
        const nr = scaleChildWithFrame(startBox, newBox, r0);
        patches[id] = { x: nr.x, y: nr.y, width: nr.width, height: nr.height };
        const f0 = startFonts[id];
        if (f0 && corner) {
          patches[id].textStyle = {
            ...f0,
            fontSize: clamp(Math.round(f0.fontSize * fontScale), 6, 400),
          };
        }
        const pf0 = startPlainFonts[id];
        if (pf0 !== undefined && corner) {
          patches[id].fontSize = clamp(Math.round(pf0 * fontScale), 6, 400);
        }
      }
      board().applyTransient(
        patches,
        carried.length > 0
          ? carriedPointPatches(carried, (p) => {
              const r = scaleChildWithFrame(startBox, newBox, {
                x: p.x,
                y: p.y,
                width: 0,
                height: 0,
              });
              return { x: r.x, y: r.y };
            })
          : undefined,
      );
    },
    onEnd: () => {
      board().endTransient();
      uiSet({ interaction: 'idle' });
    },
    onCancel: () => {
      board().cancelTransient();
      uiSet({ interaction: 'idle' });
    },
  });
}

// ---------------------------------------------------------------------------
// Marquee

function beginMarquee(e: React.PointerEvent): void {
  const startScreen = { x: e.clientX, y: e.clientY };
  const startWorld = worldPoint(e);
  const additive = e.shiftKey;
  const base = additive ? ui().selection : [];
  let started = false;

  startPointerSession({
    onMove: (ev) => {
      trackPointer(ev);
      if (!started && !passedThreshold(startScreen, ev)) return;
      started = true;
      const rect = normalizeRect(startWorld, worldPoint(ev));
      uiSet({ interaction: 'marquee', marquee: rect });
      const { elements, order } = board();
      const hit = elementsInRect(elements, order, rect);
      ui().setSelection(Array.from(new Set([...base, ...hit])));
    },
    onEnd: () => {
      if (!started && !additive) ui().clearSelection();
      uiSet({ interaction: 'idle', marquee: null });
    },
    onCancel: () => uiSet({ interaction: 'idle', marquee: null }),
  });
}

// ---------------------------------------------------------------------------
// Draw shape / frame

function beginDrawRect(e: React.PointerEvent, which: 'shape' | 'frame'): void {
  const start = worldPoint(e);
  uiSet({ interaction: 'draw' });

  const finish = (rect: Rect | null) => {
    const s = board();
    const fallback = which === 'shape' ? DEFAULT_SHAPE : DEFAULT_FRAME;
    const finalRect = rect ?? {
      x: start.x - fallback.width / 2,
      y: start.y - fallback.height / 2,
      width: fallback.width,
      height: fallback.height,
    };
    if (which === 'shape') {
      const el = makeShape(ui().shapeKind, finalRect);
      const frame = frameAt(s.elements, s.order, rectCenter(el));
      el.frameId = frame?.id ?? null;
      s.addElements([el]);
      ui().setSelection([el.id]);
    } else {
      const el = makeFrame(finalRect, frameCount(s.elements) + 1);
      // frames capture the elements they fully enclose
      const patches: Record<string, ElementPatch> = {};
      for (const other of Object.values(s.elements)) {
        if (other.type === 'frame' || other.locked) continue;
        if (
          other.x >= finalRect.x &&
          other.y >= finalRect.y &&
          other.x + other.width <= finalRect.x + finalRect.width &&
          other.y + other.height <= finalRect.y + finalRect.height
        ) {
          if (other.type !== 'comment') patches[other.id] = { frameId: el.id };
        }
      }
      s.addMany([el], [], patches);
      ui().setSelection([el.id]);
    }
    uiSet({ draftShape: null, interaction: 'idle' });
    ui().setTool('select');
  };

  startPointerSession({
    onMove: (ev) => {
      let cur = worldPoint(ev);
      if (ev.shiftKey) {
        const dx = cur.x - start.x;
        const dy = cur.y - start.y;
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        cur = { x: start.x + Math.sign(dx || 1) * m, y: start.y + Math.sign(dy || 1) * m };
      }
      uiSet({ draftShape: { tool: which, ...normalizeRect(start, cur) } });
    },
    onEnd: () => {
      const draft = ui().draftShape;
      finish(draft && draft.width >= MIN_SIZE && draft.height >= MIN_SIZE ? draft : null);
    },
    onCancel: () => uiSet({ draftShape: null, interaction: 'idle' }),
  });
}

// ---------------------------------------------------------------------------
// Draw connector / line

const FRAME_TARGET_BORDER = 16; // world px

/**
 * Element under the pointer that a connector may attach to. Frames only count
 * near their border — deep inside a frame body reads as empty canvas, so free
 * lines drawn inside frames stay free (explicit frame connections still work
 * via the frame's ports).
 */
function connectorTargetAt(pt: Point, excludeIds?: ReadonlySet<string>): string | null {
  const s = board();
  const el = topElementAt(s.elements, s.order, pt, { excludeIds });
  if (!el || el.type === 'comment') return null;
  if (el.type === 'frame') {
    const b = FRAME_TARGET_BORDER;
    const nearBorder =
      pt.x < el.x + b || pt.x > el.x + el.width - b || pt.y < el.y + b || pt.y > el.y + el.height - b;
    if (!nearBorder) return null;
  }
  return el.id;
}

function beginDrawConnector(
  e: { clientX: number; clientY: number },
  from: Attachment,
  opts: { arrowEnd: boolean },
): void {
  const start = worldPoint(e);
  const fromElementId = from.kind === 'element' ? from.elementId : null;
  uiSet({
    interaction: 'connect',
    draftConnector: {
      from,
      toPoint: start,
      toElementId: null,
      routing: 'straight',
      arrowEnd: opts.arrowEnd,
    },
  });

  startPointerSession({
    onMove: (ev) => {
      let pt = worldPoint(ev);
      if (ev.shiftKey && from.kind === 'point') {
        // 45° angle snap for plain lines
        const dx = pt.x - start.x;
        const dy = pt.y - start.y;
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        pt = { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
      }
      const exclude = new Set<string>();
      if (fromElementId) exclude.add(fromElementId);
      const targetId = connectorTargetAt(pt, exclude);
      const d = ui().draftConnector;
      if (d) uiSet({ draftConnector: { ...d, toPoint: pt, toElementId: targetId } });
    },
    onEnd: () => {
      const d = ui().draftConnector;
      uiSet({ draftConnector: null, interaction: 'idle' });
      ui().setTool('select');
      if (!d) return;
      if (from.kind === 'point' && !d.toElementId && dist(start, d.toPoint) < MIN_SIZE) return;
      const to: Attachment = d.toElementId
        ? { kind: 'element', elementId: d.toElementId, side: 'auto' }
        : { kind: 'point', x: d.toPoint.x, y: d.toPoint.y };
      const c = makeConnector(from, to, { arrowEnd: d.arrowEnd, routing: d.routing });
      board().addConnectors([c]);
      ui().setSelection([], [c.id]);
    },
    onCancel: () => uiSet({ draftConnector: null, interaction: 'idle' }),
  });
}

export function handlePortPointerDown(e: React.PointerEvent, elementId: string, side: Side): void {
  e.stopPropagation();
  e.preventDefault();
  beginDrawConnector(e, { kind: 'element', elementId, side }, { arrowEnd: true });
}

export function handleConnectorEndpointDown(
  e: React.PointerEvent,
  id: string,
  end: 'from' | 'to',
): void {
  e.stopPropagation();
  e.preventDefault();
  board().beginTransient([], [id]);
  startPointerSession({
    onMove: (ev) => {
      const pt = worldPoint(ev);
      const s = board();
      const c = s.connectors[id];
      if (!c) return;
      const otherEnd = end === 'from' ? c.to : c.from;
      const exclude = new Set<string>();
      if (otherEnd.kind === 'element') exclude.add(otherEnd.elementId);
      const targetId = connectorTargetAt(pt, exclude);
      const att: Attachment = targetId
        ? { kind: 'element', elementId: targetId, side: 'auto' }
        : { kind: 'point', x: pt.x, y: pt.y };
      s.applyTransient(undefined, { [id]: { [end]: att } });
      uiSet({ connectorTargetId: att.kind === 'element' ? att.elementId : null });
    },
    onEnd: () => {
      board().endTransient();
      uiSet({ connectorTargetId: null });
    },
    onCancel: () => {
      board().cancelTransient();
      uiSet({ connectorTargetId: null });
    },
  });
}

/** Drag a fully-detached connector (a plain line) to translate it. */
export function handleConnectorPointerDown(e: React.PointerEvent, id: string): void {
  if (ui().tool !== 'select') return;
  e.stopPropagation();
  if (e.button === 1 || ui().spaceDown) {
    beginPan(e);
    return;
  }
  if (e.button !== 0 && e.button !== 2) return;
  if (e.shiftKey) {
    const cur = ui().selectedConnectors;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    uiSet({ selectedConnectors: next });
    return;
  }
  if (!ui().selectedConnectors.includes(id)) ui().setSelection([], [id]);
  if (e.button === 2) return;

  const c = board().connectors[id];
  if (!c || c.from.kind !== 'point' || c.to.kind !== 'point') return;
  const startScreen = { x: e.clientX, y: e.clientY };
  const startWorld = worldPoint(e);
  const from0 = { ...c.from };
  const to0 = { ...c.to };
  let started = false;
  board().beginTransient([], [id]);
  startPointerSession({
    onMove: (ev) => {
      if (!started && !passedThreshold(startScreen, ev)) return;
      started = true;
      uiSet({ interaction: 'move' });
      const cur = worldPoint(ev);
      const dx = cur.x - startWorld.x;
      const dy = cur.y - startWorld.y;
      board().applyTransient(undefined, {
        [id]: {
          from: { kind: 'point', x: from0.x + dx, y: from0.y + dy },
          to: { kind: 'point', x: to0.x + dx, y: to0.y + dy },
        },
      });
    },
    onEnd: () => {
      if (started) board().endTransient();
      else board().cancelTransient();
      uiSet({ interaction: 'idle' });
    },
    onCancel: () => {
      board().cancelTransient();
      uiSet({ interaction: 'idle' });
    },
  });
}

// ---------------------------------------------------------------------------
// Element + canvas entry points

export function handleElementPointerDown(e: React.PointerEvent, id: string): void {
  if (ui().tool !== 'select') return;
  e.stopPropagation();
  if (e.button === 1 || ui().spaceDown) {
    beginPan(e);
    return;
  }
  if (ui().editingId === id) return;
  const el = board().elements[id];
  if (!el || el.locked) return;
  uiSet({ contextMenu: null });

  if (e.button === 2) {
    if (!ui().selectionSet.has(id)) ui().setSelection([id]);
    return;
  }
  if (e.button !== 0) return;
  if (e.shiftKey) {
    ui().toggleSelected(id);
    return;
  }
  if (!ui().selectionSet.has(id)) ui().setSelection([id]);
  if (ui().editingId) ui().setEditing(null);

  if (el.type === 'comment') {
    beginMoveDrag(e, id, () => {
      uiSet({ openCommentId: ui().openCommentId === id ? null : id });
    });
    return;
  }
  uiSet({ openCommentId: null });
  beginMoveDrag(e, id);
}

export function handleElementDoubleClick(e: React.MouseEvent, id: string): void {
  if (ui().tool !== 'select') return;
  e.stopPropagation();
  const el = board().elements[id];
  if (!el || el.locked) return;
  switch (el.type) {
    case 'sticky':
    case 'text':
    case 'shape':
    case 'frame':
    case 'link':
      ui().setEditing(id);
      break;
    case 'comment':
      uiSet({ openCommentId: id });
      break;
    case 'image':
      break;
  }
}

export function handleCanvasPointerDown(e: React.PointerEvent): void {
  uiSet({ contextMenu: null, openCommentId: null });
  if (ui().editingId) ui().setEditing(null);

  if (e.button === 1 || ui().spaceDown || ui().tool === 'pan') {
    beginPan(e);
    return;
  }
  if (e.button !== 0) return;

  const tool = ui().tool;
  const pt = worldPoint(e);
  const s = board();

  switch (tool) {
    case 'select':
      beginMarquee(e);
      break;
    case 'shape':
      beginDrawRect(e, 'shape');
      break;
    case 'frame':
      beginDrawRect(e, 'frame');
      break;
    case 'sticky': {
      const el = makeSticky(pt);
      const frame = frameAt(s.elements, s.order, pt);
      el.frameId = frame?.id ?? null;
      s.addElements([el]);
      ui().setSelection([el.id]);
      ui().setTool('select');
      ui().setEditing(el.id);
      break;
    }
    case 'text': {
      const el = makeText(pt);
      const frame = frameAt(s.elements, s.order, pt);
      el.frameId = frame?.id ?? null;
      s.addElements([el]);
      ui().setSelection([el.id]);
      ui().setTool('select');
      ui().setEditing(el.id);
      break;
    }
    case 'comment': {
      const target = topElementAt(s.elements, s.order, pt);
      const el = makeComment(pt, target && target.type !== 'comment' ? target.id : null);
      s.addElements([el]);
      ui().setSelection([el.id]);
      ui().setTool('select');
      uiSet({ openCommentId: el.id });
      break;
    }
    case 'line':
      beginDrawConnector(e, { kind: 'point', x: pt.x, y: pt.y }, { arrowEnd: false });
      break;
    case 'connector': {
      const targetId = connectorTargetAt(pt);
      const from: Attachment = targetId
        ? { kind: 'element', elementId: targetId, side: 'auto' }
        : { kind: 'point', x: pt.x, y: pt.y };
      beginDrawConnector(e, from, { arrowEnd: true });
      break;
    }
    case 'pan':
      break;
  }
}

export function handleCanvasContextMenu(e: React.MouseEvent): void {
  e.preventDefault();
  const { selection, selectedConnectors } = ui();
  const pt = worldPoint(e);
  uiSet({
    contextMenu: {
      x: e.clientX,
      y: e.clientY,
      worldX: pt.x,
      worldY: pt.y,
      elementIds: selection,
      connectorIds: selectedConnectors,
    },
  });
}

// ---------------------------------------------------------------------------
// Alt-drag duplicate: copy the selection in place (zero offset) so the copies
// can be dragged from the originals' position.

function duplicateInPlace(): void {
  const { selection } = ui();
  const { elements } = board();
  const els = selection
    .map((id) => elements[id])
    .filter((el): el is BoardElement => Boolean(el));
  const bounds = unionRects(els);
  const payload = collectPayload();
  if (!payload || !bounds) return;
  pastePayload(payload, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
}
