import { useEffect, useRef, useState } from 'react';
import { newId } from '@morphboards/shared';
import { worldToScreen } from '../geometry/geo';
import { useBoardStore } from '../state/boardStore';
import { useCanComment, useSessionStore } from '../state/sessionStore';
import { useUiStore } from '../state/uiStore';
import { useViewportStore } from '../state/viewportStore';

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CommentPopover() {
  const id = useUiStore((s) => s.openCommentId);
  const el = useBoardStore((s) => (id ? s.elements[id] : undefined));
  const vp = useViewportStore();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const commentable = useCanComment();
  const actor = useSessionStore((s) => s.actor);

  useEffect(() => {
    setText('');
  }, [id]);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [id, el]);

  if (!id || !el || el.type !== 'comment') return null;

  const pos = worldToScreen(vp, { x: el.x + el.width, y: el.y });
  const left = Math.min(Math.max(pos.x + 10, 8), Math.max(vp.size.width - 328, 8));
  const top = Math.min(Math.max(pos.y - 8, 8), Math.max(vp.size.height - 320, 8));

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const author = actor ? { id: actor.id, name: actor.name } : undefined;
    useBoardStore.getState().updateElements({
      [id]: {
        messages: [...el.messages, { id: newId(), text: trimmed, createdAt: Date.now(), author }],
      },
    });
    setText('');
  };

  const toggleResolved = () => {
    useBoardStore.getState().updateElements({ [id]: { resolved: !el.resolved } });
    if (!el.resolved) useUiStore.setState({ openCommentId: null });
  };

  const remove = () => {
    useBoardStore.getState().removeElements([id]);
    useUiStore.setState({ openCommentId: null });
  };

  return (
    <div
      className="comment-popover"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="comment-popover-header">
        <span className="comment-popover-title">{el.resolved ? 'Resolved' : 'Comment'}</span>
        <div className="comment-popover-actions">
          {commentable && (
            <button className="ghost-btn" title={el.resolved ? 'Reopen' : 'Resolve'} onClick={toggleResolved}>
            {el.resolved ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9M3 3v6h6" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M4 12.5 9.5 18 20 6.5" />
              </svg>
            )}
          </button>
          )}
          {commentable && (
          <button className="ghost-btn" title="Delete comment" onClick={remove}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M10 7V5h4v2m-7 0 1 13h8l1-13" />
            </svg>
          </button>
          )}
          <button className="ghost-btn" title="Close" onClick={() => useUiStore.setState({ openCommentId: null })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
      <div className="comment-messages" ref={listRef}>
        {el.messages.length === 0 && <div className="comment-empty">No messages yet</div>}
        {el.messages.map((m) => (
          <div key={m.id} className="comment-message">
            <div className="comment-message-text">{m.text}</div>
            <div className="comment-message-time">
              {m.author?.name ? `${m.author.name} · ` : ''}
              {formatTime(m.createdAt)}
            </div>
          </div>
        ))}
      </div>
      {commentable && (
        <div className="comment-compose">
          <textarea
            value={text}
            autoFocus
            rows={2}
            placeholder="Write a comment…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button className="primary-btn" onClick={submit} disabled={!text.trim()}>
            Post
          </button>
        </div>
      )}
    </div>
  );
}
