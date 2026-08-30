import { useEffect, useRef, useState } from 'react';
import type { Viewport } from '@morphboards/shared';
import { api, setApiShareToken } from '../api/client';
import { startAutosave, stopAutosave } from '../api/autosave';
import { connectRealtime, disconnectRealtime } from '../api/realtime';
import { generateThumbnail } from '../api/thumbnail';
import { CanvasViewport } from '../canvas/CanvasViewport';
import { zoomToFit } from '../interactions/actions';
import { handlePaste } from '../interactions/images';
import { installKeyboard } from '../interactions/keyboard';
import { useBoardStore } from '../state/boardStore';
import { canEdit, useSessionStore } from '../state/sessionStore';
import { useUiStore } from '../state/uiStore';
import { useViewportStore } from '../state/viewportStore';
import { CommentsSidebar } from './CommentsSidebar';
import { ContextMenu } from './ContextMenu';
import { NamePrompt } from './NamePrompt';
import { ShortcutHelp } from './ShortcutHelp';
import { StylePanel } from './StylePanel';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';

interface Props {
  boardId?: string;
  shareToken?: string;
}

function viewportKey(boardId: string): string {
  return `mb.viewport.${boardId}`;
}

function restoreViewport(boardId: string, fallback?: Viewport): void {
  try {
    const raw = localStorage.getItem(viewportKey(boardId));
    if (raw) {
      const vp = JSON.parse(raw) as Viewport;
      if (typeof vp.x === 'number' && typeof vp.zoom === 'number') {
        useViewportStore.getState().setViewport(vp);
        return;
      }
    }
  } catch {
    // ignore storage failures
  }
  if (fallback) useViewportStore.getState().setViewport(fallback);
  else requestAnimationFrame(() => requestAnimationFrame(zoomToFit));
}

export function BoardEditor({ boardId, shareToken }: Props) {
  const [state, setState] = useState<'loading' | 'name' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(0);
  const kickReason = useSessionStore((s) => s.kickReason);
  const legacyAutosave = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setApiShareToken(shareToken ?? null);

    const open = async () => {
      try {
        if (shareToken) {
          // guests need an identity for comments/presence before joining
          const me = await api.me();
          if (cancelled) return;
          if (!me.actor) {
            setState('name');
            return;
          }
          const live = await connectRealtime({ shareToken });
          if (cancelled) return;
          if (!live) {
            // static read-only fallback
            const shared = await api.getShared(shareToken);
            if (cancelled) return;
            useBoardStore.getState().load({
              id: shared.board.id,
              name: shared.board.name,
              createdAt: 0,
              updatedAt: 0,
              doc: shared.doc,
            });
            useSessionStore.setState({
              mode: 'solo',
              role: shared.role,
              shareToken,
              actor: me.actor,
            });
          }
          restoreViewport(useBoardStore.getState().boardId ?? shareToken);
          setState('ready');
          return;
        }

        // owner path: live session with legacy REST fallback
        const live = await connectRealtime({ boardId });
        if (cancelled) return;
        if (!live) {
          const board = await api.getBoard(boardId!);
          if (cancelled) return;
          useBoardStore.getState().load(board);
          startAutosave(boardId!);
          legacyAutosave.current = true;
          restoreViewport(boardId!, board.doc.viewport);
          setState('ready');
          return;
        }
        restoreViewport(boardId!);
        setState('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMsg((err as Error).message);
        setState('error');
      }
    };
    void open();

    return () => {
      cancelled = true;
      disconnectRealtime();
      if (legacyAutosave.current) {
        void stopAutosave();
        legacyAutosave.current = false;
      }
      setApiShareToken(null);
      useBoardStore.getState().unload();
      const u = useUiStore.getState();
      u.clearSelection();
      u.setTool('select');
      u.setEditing(null);
      useUiStore.setState({
        contextMenu: null,
        helpOpen: false,
        marquee: null,
        draftShape: null,
        draftConnector: null,
        hoveredId: null,
      });
    };
  }, [boardId, shareToken, nameSubmitted]);

  // persist camera per board on this device
  useEffect(() => {
    let timer: number | null = null;
    const unsub = useViewportStore.subscribe(() => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        const id = useBoardStore.getState().boardId;
        if (!id) return;
        const { x, y, zoom } = useViewportStore.getState();
        try {
          localStorage.setItem(viewportKey(id), JSON.stringify({ x, y, zoom }));
        } catch {
          // ignore storage failures
        }
      }, 800);
    });
    return () => {
      unsub();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  // live sessions: privileged clients refresh the board thumbnail periodically
  useEffect(() => {
    let lastDirty = -1;
    const interval = window.setInterval(() => {
      const s = useBoardStore.getState();
      const session = useSessionStore.getState();
      if (session.mode !== 'live' || !canEdit() || !s.boardId) return;
      if (s.dirty === lastDirty) return;
      lastDirty = s.dirty;
      const thumb = generateThumbnail(s.elements, s.order);
      if (thumb) void api.postThumbnail(s.boardId, thumb).catch(() => undefined);
    }, 25_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const cleanup = installKeyboard();
    window.addEventListener('paste', handlePaste);
    return () => {
      cleanup();
      window.removeEventListener('paste', handlePaste);
    };
  }, []);

  if (kickReason) {
    return (
      <div className="editor-message">
        <p>{kickReason}</p>
        <button className="primary-btn" onClick={() => (location.hash = '#/')}>
          Close
        </button>
      </div>
    );
  }
  if (state === 'loading') {
    return <div className="editor-message">Loading board…</div>;
  }
  if (state === 'name') {
    return (
      <NamePrompt
        onSubmit={async (name) => {
          await api.setIdentity(name);
          setNameSubmitted((n) => n + 1);
        }}
      />
    );
  }
  if (state === 'error') {
    return (
      <div className="editor-message">
        <p>Could not open this board: {errorMsg}</p>
        <button className="primary-btn" onClick={() => (location.hash = '#/')}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="editor">
      <TopBar />
      <div className="editor-body">
        <Toolbar />
        <CanvasViewport />
        <StylePanel />
        <CommentsSidebar />
      </div>
      <ContextMenu />
      <ShortcutHelp />
    </div>
  );
}
