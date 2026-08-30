import {
  type Attachment,
  type BoardElement,
  type Connector,
  newId,
} from '@morphboards/shared';
import { type Point, rectContainsPoint, unionRects } from '../geometry/geo';
import { useBoardStore } from '../state/boardStore';
import { canComment, canEdit } from '../state/sessionStore';
import { useUiStore } from '../state/uiStore';
import { useViewportStore } from '../state/viewportStore';

const board = () => useBoardStore.getState();
const ui = () => useUiStore.getState();

/** Selection plus frame children and attached comment pins (what moves together). */
export function moveClosure(ids: readonly string[]): Set<string> {
  const { elements } = board();
  const set = new Set<string>();
  for (const id of ids) {
    if (elements[id] && !elements[id].locked) set.add(id);
  }
  for (const el of Object.values(elements)) {
    if (el.frameId && set.has(el.frameId)) set.add(el.id);
  }
  for (const el of Object.values(elements)) {
    if (el.type === 'comment' && el.attachedTo && set.has(el.attachedTo)) set.add(el.id);
  }
  return set;
}

export interface CarriedPoint {
  id: string;
  end: 'from' | 'to';
  x: number;
  y: number;
}

/**
 * Free (point) connector endpoints that sit inside a frame being moved.
 * Element-attached ends follow automatically because connector geometry is
 * derived from element rects — free points have to be carried explicitly,
 * otherwise lines and arrow tips get left behind when their frame moves.
 */
export function carriedConnectorPoints(closure: ReadonlySet<string>): CarriedPoint[] {
  const { elements, connectors } = board();
  const frames: BoardElement[] = [];
  for (const id of closure) {
    const el = elements[id];
    if (el?.type === 'frame') frames.push(el);
  }
  if (frames.length === 0) return [];
  const carried: CarriedPoint[] = [];
  for (const c of Object.values(connectors)) {
    for (const end of ['from', 'to'] as const) {
      const att = c[end];
      if (att.kind !== 'point') continue;
      if (frames.some((f) => rectContainsPoint(f, att))) {
        carried.push({ id: c.id, end, x: att.x, y: att.y });
      }
    }
  }
  return carried;
}

/** Merge carried points (mapped through `map`) into per-connector patches. */
export function carriedPointPatches(
  carried: readonly CarriedPoint[],
  map: (p: Point) => Point,
): Record<string, Partial<Connector>> {
  const patches: Record<string, Partial<Connector>> = {};
  for (const cp of carried) {
    const mapped = map(cp);
    const patch = (patches[cp.id] ??= {});
    patch[cp.end] = { kind: 'point', x: mapped.x, y: mapped.y };
  }
  return patches;
}

export function deleteSelection(): void {
  const { selection, selectedConnectors } = ui();
  if (selection.length === 0 && selectedConnectors.length === 0) return;
  if (!canEdit()) {
    // commenters may only delete comment pins
    if (!canComment()) return;
    const { elements } = board();
    const commentIds = selection.filter((id) => elements[id]?.type === 'comment');
    if (commentIds.length === 0) return;
    board().removeMixed(commentIds, []);
    ui().clearSelection();
    return;
  }
  board().removeMixed(selection, selectedConnectors);
  ui().clearSelection();
}

export function deleteFrameWithContents(frameId: string): void {
  const ids = [frameId, ...Array.from(moveClosure([frameId]))];
  board().removeMixed(Array.from(new Set(ids)), []);
  ui().clearSelection();
}

export function selectAll(): void {
  const { elements, order, connectors } = board();
  const ids = order.filter((id) => elements[id] && !elements[id].locked);
  ui().setSelection(ids, Object.keys(connectors));
}

// ---------------------------------------------------------------------------
// Clipboard

interface ClipboardPayload {
  elements: BoardElement[];
  connectors: Connector[];
}

const SENTINEL = 'morphboards-clipboard:';
let internalClipboard: ClipboardPayload | null = null;

export function collectPayload(): ClipboardPayload | null {
  const { selection, selectedConnectors } = ui();
  const { elements, connectors } = board();
  const ids = moveClosure(selection);
  for (const id of selection) if (elements[id]) ids.add(id); // include locked if explicitly selected
  const els = Array.from(ids)
    .map((id) => elements[id])
    .filter((el): el is BoardElement => Boolean(el));
  const copiedFrames = els.filter((el) => el.type === 'frame');
  // A point end counts as "anchored to the copied set" when it sits inside a
  // copied frame, or when the connector's other end is a copied element.
  const endAnchored = (att: Attachment, other: Attachment) =>
    att.kind === 'element'
      ? ids.has(att.elementId)
      : copiedFrames.some((f) => rectContainsPoint(f, att)) ||
        (other.kind === 'element' && ids.has(other.elementId));
  const cs = Object.values(connectors).filter(
    (c) =>
      selectedConnectors.includes(c.id) ||
      (ids.size > 0 && endAnchored(c.from, c.to) && endAnchored(c.to, c.from)),
  );
  if (els.length === 0 && cs.length === 0) return null;
  return JSON.parse(JSON.stringify({ elements: els, connectors: cs })) as ClipboardPayload;
}

export function copySelection(): void {
  const payload = collectPayload();
  if (!payload) return;
  internalClipboard = payload;
  const sentinel = SENTINEL + JSON.stringify(payload);
  // Single image selected: put a real PNG on the OS clipboard too, so the
  // image can be pasted into external apps. Otherwise plain sentinel text.
  const only = payload.elements.length === 1 ? payload.elements[0] : null;
  if (only?.type === 'image' && payload.connectors.length === 0) {
    void writeImageClipboard(sentinel, only.assetUrl);
  } else {
    void navigator.clipboard?.writeText(sentinel).catch(() => undefined);
  }
}

/** Write sentinel text + the asset as a PNG in one clipboard entry. */
async function writeImageClipboard(sentinel: string, assetUrl: string): Promise<void> {
  try {
    if (typeof ClipboardItem === 'undefined') throw new Error('ClipboardItem unsupported');
    const blob = await (await fetch(assetUrl)).blob();
    let png = blob;
    if (blob.type !== 'image/png') {
      // the async clipboard only accepts PNG images
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      bitmap.close();
      const converted = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (!converted) throw new Error('PNG conversion failed');
      png = converted;
    }
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([sentinel], { type: 'text/plain' }),
        'image/png': png,
      }),
    ]);
  } catch {
    // clipboard images unavailable (permissions, decode failure) — text still works
    void navigator.clipboard?.writeText(sentinel).catch(() => undefined);
  }
}

export function cutSelection(): void {
  if (!canEdit()) return;
  copySelection();
  deleteSelection();
}

export function parseClipboardText(text: string): ClipboardPayload | null {
  if (!text.startsWith(SENTINEL)) return null;
  try {
    const payload = JSON.parse(text.slice(SENTINEL.length)) as ClipboardPayload;
    if (Array.isArray(payload.elements) && Array.isArray(payload.connectors)) return payload;
  } catch {
    // fall through
  }
  return null;
}

export function pastePayload(payload: ClipboardPayload, at?: Point): BoardElement[] {
  if (!canEdit()) return [];
  const idMap = new Map<string, string>();
  for (const el of payload.elements) idMap.set(el.id, newId());

  const els: BoardElement[] = payload.elements.map((el) => {
    const copy: BoardElement = {
      ...el,
      id: idMap.get(el.id)!,
      frameId: el.frameId ? (idMap.get(el.frameId) ?? null) : null,
    };
    if (copy.type === 'comment') {
      copy.attachedTo = copy.attachedTo ? (idMap.get(copy.attachedTo) ?? null) : null;
    }
    return copy;
  });

  const remapAtt = (att: Attachment): Attachment => {
    if (att.kind === 'element') {
      const mapped = idMap.get(att.elementId);
      return mapped ? { ...att, elementId: mapped } : { ...att };
    }
    return { ...att };
  };
  const cs: Connector[] = payload.connectors.map((c) => ({
    ...c,
    id: newId(),
    from: remapAtt(c.from),
    to: remapAtt(c.to),
  }));

  // position: center at `at`, otherwise offset slightly from the originals
  let dx = 24;
  let dy = 24;
  const bounds = unionRects(els.map((el) => el));
  if (at && bounds) {
    dx = at.x - (bounds.x + bounds.width / 2);
    dy = at.y - (bounds.y + bounds.height / 2);
  }
  for (const el of els) {
    el.x += dx;
    el.y += dy;
  }
  const shiftPt = (att: Attachment): Attachment =>
    att.kind === 'point' ? { ...att, x: att.x + dx, y: att.y + dy } : att;
  for (const c of cs) {
    c.from = shiftPt(c.from);
    c.to = shiftPt(c.to);
  }

  board().addMany(els, cs);
  ui().setSelection(
    els.map((el) => el.id),
    cs.map((c) => c.id),
  );
  return els;
}

export function pasteInternal(at?: Point): BoardElement[] | null {
  if (!internalClipboard) return null;
  return pastePayload(internalClipboard, at);
}

export function duplicateSelection(): void {
  if (!canEdit()) return;
  const payload = collectPayload();
  if (!payload) return;
  pastePayload(payload);
}

// ---------------------------------------------------------------------------
// View helpers

export function zoomToFit(): void {
  const { elements, order } = board();
  const bounds = unionRects(order.map((id) => elements[id]).filter(Boolean));
  if (bounds) useViewportStore.getState().fitBounds(bounds);
}

export function zoomToSelection(): void {
  const { selection } = ui();
  const { elements } = board();
  const bounds = unionRects(
    selection.map((id) => elements[id]).filter((el): el is BoardElement => Boolean(el)),
  );
  if (bounds) useViewportStore.getState().fitBounds(bounds);
}

export function toggleLockSelection(): void {
  const { selection } = ui();
  const { elements } = board();
  const anyUnlocked = selection.some((id) => elements[id] && !elements[id].locked);
  const patches: Record<string, { locked: boolean }> = {};
  for (const id of selection) if (elements[id]) patches[id] = { locked: anyUnlocked };
  board().updateElements(patches);
  if (anyUnlocked) ui().clearSelection();
}

export function unlockAll(): void {
  const { elements } = board();
  const patches: Record<string, { locked: boolean }> = {};
  for (const el of Object.values(elements)) if (el.locked) patches[el.id] = { locked: false };
  board().updateElements(patches);
}
