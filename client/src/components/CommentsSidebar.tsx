import { useState } from 'react';
import type { CommentElement } from '@morphboards/shared';
import { useBoardStore } from '../state/boardStore';
import { useUiStore } from '../state/uiStore';
import { useViewportStore } from '../state/viewportStore';
import { formatTime } from './CommentPopover';
import { Icons } from './icons';

function jumpTo(el: CommentElement): void {
  const vp = useViewportStore.getState();
  const zoom = Math.max(vp.zoom, 0.75);
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  vp.setViewport({ x: vp.size.width / 2 - cx * zoom, y: vp.size.height / 2 - cy * zoom, zoom });
  useUiStore.getState().setSelection([el.id]);
  useUiStore.setState({ openCommentId: el.id });
}

export function CommentsSidebar() {
  const open = useUiStore((s) => s.commentsSidebarOpen);
  const elements = useBoardStore((s) => s.elements);
  const [showResolved, setShowResolved] = useState(false);
  if (!open) return null;

  const pins = Object.values(elements)
    .filter((el): el is CommentElement => el.type === 'comment')
    .filter((el) => showResolved || !el.resolved)
    .sort((a, b) => {
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
      const ta = a.messages[a.messages.length - 1]?.createdAt ?? 0;
      const tb = b.messages[b.messages.length - 1]?.createdAt ?? 0;
      return tb - ta;
    });

  return (
    <div className="comments-sidebar">
      <div className="sidebar-header">
        <span>Comments</span>
        <label className="sidebar-toggle">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Resolved
        </label>
        <button
          className="ghost-btn"
          title="Close"
          onClick={() => useUiStore.setState({ commentsSidebarOpen: false })}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="sidebar-list">
        {pins.length === 0 && (
          <div className="sidebar-empty">
            No comments yet.
            <br />
            Use the comment tool (M) to pin one.
          </div>
        )}
        {pins.map((el) => {
          const first = el.messages[0];
          const last = el.messages[el.messages.length - 1];
          return (
            <div
              key={el.id}
              className={`sidebar-item ${el.resolved ? 'resolved' : ''}`}
              onClick={() => jumpTo(el)}
            >
              <div className="sidebar-item-text">{first?.text ?? 'Empty comment'}</div>
              <div className="sidebar-item-meta">
                <span>
                  {el.messages.length} message{el.messages.length === 1 ? '' : 's'}
                  {last ? ` · ${formatTime(last.createdAt)}` : ''}
                </span>
                <button
                  className={`ghost-btn small ${el.resolved ? 'active' : ''}`}
                  title={el.resolved ? 'Reopen' : 'Resolve'}
                  onClick={(e) => {
                    e.stopPropagation();
                    useBoardStore.getState().updateElements({ [el.id]: { resolved: !el.resolved } });
                  }}
                >
                  {Icons.check({ size: 13 })}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
