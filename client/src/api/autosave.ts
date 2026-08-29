import { create } from 'zustand';
import { useBoardStore } from '../state/boardStore';
import { useViewportStore } from '../state/viewportStore';
import { api } from './client';
import { generateThumbnail } from './thumbnail';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

export const useSaveStatus = create<{ status: SaveStatus }>()(() => ({ status: 'saved' }));

const DEBOUNCE_MS = 750;
const THUMBNAIL_EVERY_MS = 20_000;
const RETRY_MS = 5_000;

let timer: number | null = null;
let unsubscribe: (() => void) | null = null;
let pending = false;
let saving = false;
let lastThumbnailAt = 0;
let activeBoardId: string | null = null;

function docWithViewport() {
  const doc = useBoardStore.getState().getDoc();
  const { x, y, zoom } = useViewportStore.getState();
  return { ...doc, viewport: { x, y, zoom } };
}

async function saveNow(): Promise<void> {
  if (!activeBoardId || saving) return;
  const boardId = activeBoardId;
  pending = false;
  saving = true;
  useSaveStatus.setState({ status: 'saving' });
  try {
    let thumbnail: string | undefined;
    if (Date.now() - lastThumbnailAt > THUMBNAIL_EVERY_MS) {
      const s = useBoardStore.getState();
      thumbnail = generateThumbnail(s.elements, s.order);
      lastThumbnailAt = Date.now();
    }
    await api.saveBoard(boardId, docWithViewport(), thumbnail);
    saving = false;
    if (pending) {
      schedule();
      return;
    }
    useSaveStatus.setState({ status: 'saved' });
  } catch (err) {
    console.error('Autosave failed', err);
    saving = false;
    useSaveStatus.setState({ status: 'error' });
    if (activeBoardId === boardId) {
      timer = window.setTimeout(() => void saveNow(), RETRY_MS);
    }
  }
}

function schedule(): void {
  pending = true;
  useSaveStatus.setState({ status: 'unsaved' });
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => void saveNow(), DEBOUNCE_MS);
}

function onPageHide(): void {
  if (!pending || !activeBoardId) return;
  // best-effort flush; keepalive works for small/medium docs
  void fetch(`/api/boards/${activeBoardId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ doc: docWithViewport() }),
    keepalive: true,
  });
  pending = false;
}

export function startAutosave(boardId: string): void {
  stopAutosaveInternal();
  activeBoardId = boardId;
  lastThumbnailAt = 0;
  useSaveStatus.setState({ status: 'saved' });
  unsubscribe = useBoardStore.subscribe((s, prev) => {
    if (s.dirty !== prev.dirty && s.boardId === activeBoardId) schedule();
  });
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden' && pending) {
    if (timer !== null) window.clearTimeout(timer);
    void saveNow();
  }
}

/** Save immediately if there are unsaved changes (awaitable). */
export async function flushAutosave(): Promise<void> {
  if (timer !== null) window.clearTimeout(timer);
  if (pending) await saveNow();
}

function stopAutosaveInternal(): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  unsubscribe?.();
  unsubscribe = null;
  window.removeEventListener('pagehide', onPageHide);
  document.removeEventListener('visibilitychange', onVisibilityChange);
}

export async function stopAutosave(): Promise<void> {
  await flushAutosave();
  stopAutosaveInternal();
  activeBoardId = null;
}
