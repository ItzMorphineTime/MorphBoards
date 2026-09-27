import { useState } from 'react';
import { api } from '../api/client';
import { useSaveStatus } from '../api/autosave';
import { zoomToFit } from '../interactions/actions';
import { useBoardStore } from '../state/boardStore';
import { useCanComment, useCanEdit, useIsOwner, useSessionStore } from '../state/sessionStore';
import { useUiStore } from '../state/uiStore';
import { useViewportStore } from '../state/viewportStore';
import { Icons } from './icons';
import { ShareDialog } from './ShareDialog';

const STATUS_LABEL = {
  saved: 'Saved',
  unsaved: 'Unsaved…',
  saving: 'Saving…',
  error: 'Save failed — retrying',
} as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function TopBar() {
  const boardId = useBoardStore((s) => s.boardId);
  const name = useBoardStore((s) => s.name);
  const canUndo = useBoardStore((s) => s.undoStack.length > 0);
  const canRedo = useBoardStore((s) => s.redoStack.length > 0);
  const status = useSaveStatus((s) => s.status);
  const zoom = useViewportStore((s) => s.zoom);
  const commentsOpen = useUiStore((s) => s.commentsSidebarOpen);
  const session = useSessionStore();
  const editable = useCanEdit();
  const commentable = useCanComment();
  const owner = useIsOwner();
  const [shareOpen, setShareOpen] = useState(false);

  const commitName = (value: string) => {
    const next = value.trim();
    if (!boardId || !next || next === name) return;
    useBoardStore.getState().setName(next);
    void api.renameBoard(boardId, next).catch((err: Error) => console.error(err));
  };

  const liveStatus = session.mode === 'live';

  return (
    <div className="topbar">
      <div className="topbar-group">
        {owner ? (
          <button className="topbar-mark" title="All boards" onClick={() => (location.hash = '#/')}>
            <img src="/brand/morph-monogram-dark.svg" alt="All boards" draggable={false} />
          </button>
        ) : (
          <span className="topbar-mark">
            <img src="/brand/morph-monogram-dark.svg" alt="Morph" draggable={false} />
          </span>
        )}
        {owner ? (
          <input
            key={boardId ?? 'none'}
            className="board-name-input"
            defaultValue={name}
            spellCheck={false}
            onBlur={(e) => commitName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                (e.target as HTMLInputElement).value = name;
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        ) : (
          <span className="board-name-static">{name}</span>
        )}
        {liveStatus ? (
          <span
            className={`save-status ${session.connected ? 'status-live' : 'status-offline'}`}
            title={session.connected ? 'Connected — changes sync live' : 'Connection lost — reconnecting'}
          >
            <span className="save-dot" />
            {session.connected ? 'Live' : 'Reconnecting…'}
          </span>
        ) : (
          <span className={`save-status status-${status}`} title={STATUS_LABEL[status]}>
            <span className="save-dot" />
            {STATUS_LABEL[status]}
          </span>
        )}
        {!owner && <span className="role-badge">{session.role}</span>}
      </div>

      <div className="topbar-group">
        {session.peers.length > 0 && (
          <div className="avatar-stack" title={session.peers.map((p) => p.name).join(', ')}>
            {session.peers.slice(0, 5).map((p) => (
              <span key={p.peerId} className="avatar" style={{ background: p.color }} title={p.name}>
                {initials(p.name)}
              </span>
            ))}
            {session.peers.length > 5 && (
              <span className="avatar avatar-more">+{session.peers.length - 5}</span>
            )}
          </div>
        )}
        {owner && (
          <button
            className={`ghost-btn ${shareOpen ? 'active' : ''}`}
            title="Share this board"
            onClick={() => setShareOpen(true)}
          >
            {Icons.upload({ size: 17 })}
          </button>
        )}
        {commentable && (
          <>
            <button
              className="ghost-btn"
              title="Undo (Ctrl+Z)"
              disabled={!canUndo}
              onClick={() => useBoardStore.getState().undo()}
            >
              {Icons.undo({ size: 17 })}
            </button>
            <button
              className="ghost-btn"
              title="Redo (Ctrl+Y)"
              disabled={!canRedo}
              onClick={() => useBoardStore.getState().redo()}
            >
              {Icons.redo({ size: 17 })}
            </button>
          </>
        )}

        <div className="topbar-sep" />

        <button
          className="ghost-btn"
          title="Zoom out (Ctrl+-)"
          onClick={() => useViewportStore.getState().zoomStep(-1)}
        >
          {Icons.minus({ size: 17 })}
        </button>
        <button
          className="zoom-label"
          title="Reset to 100% (Ctrl+0)"
          onClick={() => useViewportStore.getState().setZoomCentered(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          className="ghost-btn"
          title="Zoom in (Ctrl+=)"
          onClick={() => useViewportStore.getState().zoomStep(1)}
        >
          {Icons.plus({ size: 17 })}
        </button>
        <button className="ghost-btn" title="Zoom to fit (Shift+1)" onClick={zoomToFit}>
          {Icons.fit({ size: 17 })}
        </button>

        <div className="topbar-sep" />

        <button
          className={`ghost-btn ${commentsOpen ? 'active' : ''}`}
          title="Comments"
          onClick={() => useUiStore.setState({ commentsSidebarOpen: !commentsOpen })}
        >
          {Icons.comment({ size: 17 })}
        </button>
        {boardId && editable && (
          <a className="ghost-btn" title="Export board (.zip)" href={api.exportUrl(boardId)}>
            {Icons.download({ size: 17 })}
          </a>
        )}
        <button
          className="ghost-btn"
          title="Keyboard shortcuts (?)"
          onClick={() => useUiStore.setState({ helpOpen: !useUiStore.getState().helpOpen })}
        >
          {Icons.help({ size: 17 })}
        </button>
      </div>
      {shareOpen && <ShareDialog onClose={() => setShareOpen(false)} />}
    </div>
  );
}
