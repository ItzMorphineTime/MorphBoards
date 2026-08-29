import type { BoardElement } from '@morphboards/shared';
import { api } from '../api/client';
import { makeImage, makeLink, makeText } from '../defaults';
import { type Point, rectCenter } from '../geometry/geo';
import { frameAt } from '../geometry/hitTest';
import { useBoardStore, type ElementPatch } from '../state/boardStore';
import { useUiStore } from '../state/uiStore';
import { parseClipboardText, pasteInternal, pastePayload } from './actions';
import { lastPointerWorld, worldPoint } from './interactions';

const board = () => useBoardStore.getState();
const ui = () => useUiStore.getState();

const MAX_DISPLAY_W = 480;
const MAX_DISPLAY_H = 360;

function readImageSize(file: Blob): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth || 480, h: img.naturalHeight || 360 });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ w: 480, h: 360 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function adoptFramePatch(el: BoardElement): ElementPatch | null {
  const s = board();
  const frame = frameAt(s.elements, s.order, rectCenter(el));
  return frame ? { frameId: frame.id } : null;
}

export async function uploadImageFiles(files: File[], atWorld: Point): Promise<void> {
  const boardId = board().boardId;
  if (!boardId || files.length === 0) return;

  const results = await Promise.all(
    files.map(async (file) => {
      const [dims, upload] = await Promise.all([
        readImageSize(file),
        api.uploadAsset(boardId, file).catch((err: Error) => {
          console.error('Upload failed', err);
          return null;
        }),
      ]);
      return upload ? { dims, upload, name: file.name } : null;
    }),
  );

  const els: BoardElement[] = [];
  let offsetX = 0;
  for (const r of results) {
    if (!r) continue;
    const scale = Math.min(MAX_DISPLAY_W / r.dims.w, MAX_DISPLAY_H / r.dims.h, 1);
    const w = Math.max(r.dims.w * scale, 24);
    const h = Math.max(r.dims.h * scale, 24);
    const el = makeImage(
      { x: atWorld.x - w / 2 + offsetX, y: atWorld.y - h / 2, width: w, height: h },
      r.upload.url,
      r.dims.w,
      r.dims.h,
    );
    el.title = r.name;
    els.push(el);
    offsetX += w + 24;
  }
  if (els.length === 0) return;

  const patches: Record<string, ElementPatch> = {};
  for (const el of els) {
    const p = adoptFramePatch(el);
    if (p) patches[el.id] = p;
  }
  board().addMany(els, [], patches);
  ui().setSelection(els.map((el) => el.id));
}

function looksLikeUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

export function placeLink(url: string, at: Point): void {
  const el = makeLink({ x: at.x - 150, y: at.y - 38 }, url.trim());
  const p = adoptFramePatch(el);
  board().addMany([el], [], p ? { [el.id]: p } : undefined);
  ui().setSelection([el.id]);
}

function placeText(content: string, at: Point): void {
  const el = makeText({ x: at.x, y: at.y });
  el.text = content;
  el.width = Math.min(Math.max(240, content.length * 8), 560);
  board().addElements([el]);
  ui().setSelection([el.id]);
}

/** "Paste here" from the context menu: internal clipboard first, then OS text. */
export async function pasteAt(at: Point): Promise<void> {
  if (pasteInternal(at)) return;
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    const payload = parseClipboardText(text);
    if (payload) pastePayload(payload, at);
    else if (looksLikeUrl(text)) placeLink(text, at);
    else placeText(text, at);
  } catch {
    // clipboard read not permitted — nothing to paste
  }
}

// ---------------------------------------------------------------------------
// Drag & drop onto the canvas

export function handleCanvasDragOver(e: React.DragEvent): void {
  e.preventDefault();
}

export function handleCanvasDrop(e: React.DragEvent): void {
  e.preventDefault();
  const at = worldPoint(e);
  const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
  if (files.length > 0) {
    void uploadImageFiles(files, at);
    return;
  }
  const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  if (uri && looksLikeUrl(uri)) placeLink(uri.split('\n')[0], at);
}

// ---------------------------------------------------------------------------
// OS clipboard paste (installed on window while a board is open)

export function handlePaste(e: ClipboardEvent): void {
  const target = e.target as HTMLElement | null;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable
  ) {
    return;
  }
  const data = e.clipboardData;
  if (!data) return;

  const imageFiles: File[] = [];
  for (const item of data.items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) imageFiles.push(file);
    }
  }
  if (imageFiles.length > 0) {
    e.preventDefault();
    void uploadImageFiles(imageFiles, lastPointerWorld);
    return;
  }

  const text = data.getData('text/plain');
  if (!text) return;
  e.preventDefault();
  const payload = parseClipboardText(text);
  if (payload) {
    pastePayload(payload, lastPointerWorld);
  } else if (looksLikeUrl(text)) {
    placeLink(text, lastPointerWorld);
  } else {
    placeText(text, lastPointerWorld);
  }
}
