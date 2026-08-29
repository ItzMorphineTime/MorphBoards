import { api } from '../api/client';
import { useSaveStatus } from '../api/autosave';
import { zoomToFit } from '../interactions/actions';
import { useBoardStore } from '../state/boardStore';
import { useUiStore } from '../state/uiStore';
import { useViewportStore } from '../state/viewportStore';
import { Icons } from './icons';

const STATUS_LABEL = {
  saved: 'Saved',
  unsaved: 'Unsaved…',
  saving: 'Saving…',
  error: 'Save failed — retrying',
} as const;

export function TopBar() {
  const boardId = useBoardStore((s) => s.boardId);
  const name = useBoardStore((s) => s.name);
  const canUndo = useBoardStore((s) => s.undoStack.length > 0);
  const canRedo = useBoardStore((s) => s.redoStack.length > 0);
  const status = useSaveStatus((s) => s.status);
  const zoom = useViewportStore((s) => s.zoom);
  const commentsOpen = useUiStore((s) => s.commentsSidebarOpen);

  const commitName = (value: string) => {
    const next = value.trim();
    if (!boardId || !next || next === name) return;
    useBoardStore.getState().setName(next);
    void api.renameBoard(boardId, next).catch((err: Error) => console.error(err));
  };

  return (
    <div className="topbar">
      <div className="topbar-group">
        <button className="ghost-btn" title="All boards" onClick={() => (location.hash = '#/')}>
          {Icons.back({ size: 17 })}
        </button>
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
        <span className={`save-status status-${status}`} title={STATUS_LABEL[status]}>
          <span className="save-dot" />
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="topbar-group">
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
        {boardId && (
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
    </div>
  );
}
