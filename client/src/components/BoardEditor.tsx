import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { startAutosave, stopAutosave } from '../api/autosave';
import { CanvasViewport } from '../canvas/CanvasViewport';
import { zoomToFit } from '../interactions/actions';
import { handlePaste } from '../interactions/images';
import { installKeyboard } from '../interactions/keyboard';
import { useBoardStore } from '../state/boardStore';
import { useUiStore } from '../state/uiStore';
import { useViewportStore } from '../state/viewportStore';
import { CommentsSidebar } from './CommentsSidebar';
import { ContextMenu } from './ContextMenu';
import { ShortcutHelp } from './ShortcutHelp';
import { StylePanel } from './StylePanel';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';

export function BoardEditor({ boardId }: { boardId: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    api
      .getBoard(boardId)
      .then((board) => {
        if (cancelled) return;
        useBoardStore.getState().load(board);
        if (board.doc.viewport) {
          useViewportStore.getState().setViewport(board.doc.viewport);
        } else {
          // fit once the canvas has measured itself
          requestAnimationFrame(() => requestAnimationFrame(zoomToFit));
        }
        startAutosave(boardId);
        setState('ready');
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setErrorMsg(err.message);
        setState('error');
      });

    return () => {
      cancelled = true;
      void stopAutosave();
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
  }, [boardId]);

  useEffect(() => {
    const cleanup = installKeyboard();
    window.addEventListener('paste', handlePaste);
    return () => {
      cleanup();
      window.removeEventListener('paste', handlePaste);
    };
  }, []);

  if (state === 'loading') {
    return <div className="editor-message">Loading board…</div>;
  }
  if (state === 'error') {
    return (
      <div className="editor-message">
        <p>Could not open this board: {errorMsg}</p>
        <button className="primary-btn" onClick={() => (location.hash = '#/')}>
          Back to boards
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
