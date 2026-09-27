import {
  type ActorInfo,
  type BoardDoc,
  type BoardOp,
  type Capability,
  type DocDiff,
  newId,
  opFromDiff,
  type PeerInfo,
} from '@morphboards/shared';
import {
  setOpEmitter,
  setPreviewEmitter,
  useBoardStore,
  type ConnectorPatch,
  type ElementPatch,
} from '../state/boardStore';
import {
  clearPresence,
  removePeerPresence,
  setPeerPresence,
} from '../state/presenceStore';
import { resetSession, useSessionStore } from '../state/sessionStore';
import { useUiStore } from '../state/uiStore';

interface ServerMessage {
  t: 'snapshot' | 'op' | 'presence' | 'preview' | 'peer-join' | 'peer-leave' | 'kick' | 'error';
  seq?: number;
  board?: { id: string; name: string };
  doc?: BoardDoc;
  self?: { peerId: string; actor: ActorInfo; role: Capability };
  peers?: PeerInfo[];
  peerId?: string;
  peer?: PeerInfo;
  opId?: string;
  op?: BoardOp;
  order?: string[];
  cursor?: { x: number; y: number } | null;
  selection?: string[];
  elements?: Record<string, ElementPatch>;
  connectors?: Record<string, ConnectorPatch>;
  reason?: string;
  message?: string;
}

let ws: WebSocket | null = null;
let selfPeerId: string | null = null;
let closedByUs = false;
/** Socket closed because the page was hidden (unload or back/forward cache). */
let suspended = false;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
let currentOpts: { boardId?: string; shareToken?: string } | null = null;
let pendingOps: { opId: string; op: BoardOp }[] = [];
let unsubscribeSelection: (() => void) | null = null;

// -------------------------------------------------------------- throttles

let lastCursor: { x: number; y: number } | null = null;
let presenceTimer: number | null = null;

function schedulePresence(): void {
  if (presenceTimer !== null || !ws || ws.readyState !== WebSocket.OPEN) return;
  presenceTimer = window.setTimeout(() => {
    presenceTimer = null;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        t: 'presence',
        cursor: lastCursor,
        selection: useUiStore.getState().selection,
      }),
    );
  }, 80);
}

/** Called from the canvas on pointer moves (world coords). */
export function reportCursor(pt: { x: number; y: number }): void {
  lastCursor = pt;
  schedulePresence();
}

let previewAccElements: Record<string, ElementPatch> = {};
let previewAccConnectors: Record<string, ConnectorPatch> = {};
let previewTimer: number | null = null;

function queuePreview(
  elementPatches?: Record<string, ElementPatch>,
  connectorPatches?: Record<string, ConnectorPatch>,
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (elementPatches) {
    for (const [id, p] of Object.entries(elementPatches)) {
      previewAccElements[id] = { ...previewAccElements[id], ...p } as ElementPatch;
    }
  }
  if (connectorPatches) {
    for (const [id, p] of Object.entries(connectorPatches)) {
      previewAccConnectors[id] = { ...previewAccConnectors[id], ...p };
    }
  }
  if (previewTimer !== null) return;
  previewTimer = window.setTimeout(() => {
    previewTimer = null;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg = {
      t: 'preview',
      elements: Object.keys(previewAccElements).length ? previewAccElements : undefined,
      connectors: Object.keys(previewAccConnectors).length ? previewAccConnectors : undefined,
    };
    previewAccElements = {};
    previewAccConnectors = {};
    if (msg.elements || msg.connectors) ws.send(JSON.stringify(msg));
  }, 50);
}

// ------------------------------------------------------------------ ops out

function sendDiff(diff: DocDiff): void {
  const op = opFromDiff(diff);
  if (!op.elements && !op.connectors && !op.orderAdd && !op.orderRemove && !op.orderSet) return;
  const msg = { opId: newId(), op };
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ t: 'op', ...msg }));
  } else {
    pendingOps.push(msg);
  }
}

// ------------------------------------------------------------------ connect

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const params = new URLSearchParams();
  if (currentOpts?.boardId) params.set('board', currentOpts.boardId);
  if (currentOpts?.shareToken) params.set('share', currentOpts.shareToken);
  return `${proto}://${location.host}/ws?${params.toString()}`;
}

function handleMessage(msg: ServerMessage): void {
  const board = useBoardStore.getState();
  switch (msg.t) {
    case 'snapshot': {
      selfPeerId = msg.self?.peerId ?? null;
      reconnectAttempts = 0;
      board.load({
        id: msg.board!.id,
        name: msg.board!.name,
        createdAt: 0,
        updatedAt: 0,
        doc: msg.doc!,
      });
      clearPresence();
      useSessionStore.setState({
        mode: 'live',
        connected: true,
        role: msg.self?.role ?? 'viewer',
        actor: msg.self?.actor ?? null,
        peers: msg.peers ?? [],
        shareToken: currentOpts?.shareToken ?? null,
      });
      const queued = pendingOps;
      pendingOps = [];
      for (const q of queued) ws?.send(JSON.stringify({ t: 'op', ...q }));
      return;
    }
    case 'op': {
      if (msg.peerId === selfPeerId) {
        // our own echo: only the canonical order may differ from what we applied
        if (msg.order) board.applyRemoteOp({}, msg.order);
      } else if (msg.op) {
        board.applyRemoteOp(msg.op, msg.order);
      }
      return;
    }
    case 'presence': {
      if (msg.peerId && msg.peerId !== selfPeerId) {
        setPeerPresence(msg.peerId, { cursor: msg.cursor ?? null, selection: msg.selection ?? [] });
      }
      return;
    }
    case 'preview': {
      if (msg.peerId !== selfPeerId) {
        board.applyPreviewPatches(msg.elements, msg.connectors);
      }
      return;
    }
    case 'peer-join': {
      if (msg.peer) {
        useSessionStore.setState((s) => ({
          peers: [...s.peers.filter((p) => p.peerId !== msg.peer!.peerId), msg.peer!],
        }));
      }
      return;
    }
    case 'peer-leave': {
      if (msg.peerId) {
        useSessionStore.setState((s) => ({ peers: s.peers.filter((p) => p.peerId !== msg.peerId) }));
        removePeerPresence(msg.peerId);
      }
      return;
    }
    case 'kick': {
      closedByUs = true;
      useSessionStore.setState({ kickReason: msg.reason ?? 'Disconnected', connected: false });
      ws?.close();
      return;
    }
    case 'error': {
      console.warn('Server rejected message:', msg.message);
      return;
    }
  }
}

function scheduleReconnect(): void {
  if (closedByUs || reconnectTimer !== null || !currentOpts) return;
  const delay = Math.min(1000 * 1.6 ** reconnectAttempts, 10_000);
  reconnectAttempts += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    void openSocket();
  }, delay);
}

function openSocket(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      settle(false);
      return;
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        if (msg.t === 'snapshot') settle(true);
        handleMessage(msg);
      } catch (err) {
        console.error('realtime message error', err);
      }
    };
    ws.onclose = () => {
      useSessionStore.setState({ connected: false });
      settle(false);
      scheduleReconnect();
    };
    ws.onerror = () => {
      settle(false);
    };
  });
}

// A page frozen in the back/forward cache keeps its socket open, so peers
// would keep seeing a ghost of this tab. Leave the room whenever the page is
// hidden, and rejoin if it is restored.
function onPageHide(): void {
  if (!ws) return;
  suspended = true;
  closedByUs = true;
  ws.close();
}

function onPageShow(e: PageTransitionEvent): void {
  if (!e.persisted || !suspended || !currentOpts) return;
  suspended = false;
  closedByUs = false;
  void openSocket();
}

/**
 * Open a live session. Resolves true once the first snapshot has loaded the
 * board; false when the socket can't connect (caller may fall back to REST).
 */
export async function connectRealtime(opts: { boardId?: string; shareToken?: string }): Promise<boolean> {
  disconnectRealtime();
  closedByUs = false;
  suspended = false;
  currentOpts = opts;
  setOpEmitter(sendDiff);
  setPreviewEmitter(queuePreview);
  unsubscribeSelection = useUiStore.subscribe((s, prev) => {
    if (s.selection !== prev.selection) schedulePresence();
  });
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  return openSocket();
}

export function disconnectRealtime(): void {
  closedByUs = true;
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  setOpEmitter(null);
  setPreviewEmitter(null);
  unsubscribeSelection?.();
  unsubscribeSelection = null;
  pendingOps = [];
  selfPeerId = null;
  currentOpts = null;
  try {
    ws?.close();
  } catch {
    // already closed
  }
  ws = null;
  clearPresence();
  resetSession();
}
