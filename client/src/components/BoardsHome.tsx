import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardListItem } from '@morphboards/shared';
import { api } from '../api/client';
import { Icons } from './icons';

function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function BoardsHome() {
  const [boards, setBoards] = useState<BoardListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    api
      .listBoards()
      .then(setBoards)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(refresh, [refresh]);

  const createBoard = async () => {
    const board = await api.createBoard();
    location.hash = `#/b/${board.id}`;
  };

  const importBoard = async (file: File) => {
    try {
      const meta = await api.importBoard(file);
      location.hash = `#/b/${meta.id}`;
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="home">
      <div className="home-header">
        <img
          className="home-lockup"
          src="/brand/morph-dark-event-lockup.svg"
          alt="Morph Interactive Media"
          draggable={false}
        />
        <div className="home-actions">
          <button className="secondary-btn" onClick={() => importRef.current?.click()}>
            {Icons.upload({ size: 15 })} Import
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".zip"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importBoard(file);
            }}
          />
          <button className="primary-btn" onClick={() => void createBoard()}>
            {Icons.plus({ size: 15 })} New board
          </button>
        </div>
      </div>

      <div className="home-heading">
        <span className="eyebrow">Morph / Boards</span>
        <h1 className="home-title">Shot boards</h1>
        <span className="home-rule" aria-hidden="true" />
        {boards !== null && boards.length > 0 && (
          <span className="home-count">
            {boards.length} board{boards.length === 1 ? '' : 's'} · last edited{' '}
            {timeAgo(Math.max(...boards.map((b) => b.updatedAt)))}
          </span>
        )}
      </div>

      {error && <div className="home-error">Could not reach the server: {error}</div>}
      {!error && boards === null && <div className="home-loading">Loading boards…</div>}
      {boards !== null && boards.length === 0 && (
        <div className="home-empty">
          <p>No boards yet.</p>
          <button className="primary-btn" onClick={() => void createBoard()}>
            {Icons.plus({ size: 15 })} Create your first board
          </button>
        </div>
      )}

      <div className="board-grid">
        {boards?.map((b) => (
          <div key={b.id} className="board-card" onClick={() => (location.hash = `#/b/${b.id}`)}>
            <div className="board-thumb">
              {b.thumbnailUrl ? <img src={b.thumbnailUrl} alt="" draggable={false} /> : <div className="thumb-placeholder" />}
            </div>
            <div className="board-card-body">
              {renamingId === b.id ? (
                <input
                  className="board-rename-input"
                  defaultValue={b.name}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onBlur={async (e) => {
                    const name = e.target.value.trim();
                    setRenamingId(null);
                    if (name && name !== b.name) {
                      await api.renameBoard(b.id, name);
                      refresh();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                />
              ) : (
                <div
                  className="board-card-name"
                  title="Double-click to rename"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(b.id);
                  }}
                >
                  {b.name}
                </div>
              )}
              <div className="board-card-meta">{timeAgo(b.updatedAt)}</div>
            </div>
            <div className="board-card-actions" onClick={(e) => e.stopPropagation()}>
              <button
                className="ghost-btn small"
                title="Duplicate"
                onClick={async () => {
                  await api.duplicateBoard(b.id);
                  refresh();
                }}
              >
                {Icons.duplicate({ size: 14 })}
              </button>
              <a className="ghost-btn small" title="Export (.zip)" href={api.exportUrl(b.id)}>
                {Icons.download({ size: 14 })}
              </a>
              <button
                className="ghost-btn small danger"
                title="Delete"
                onClick={async () => {
                  if (confirm(`Delete "${b.name}"? This removes its images too.`)) {
                    await api.deleteBoard(b.id);
                    refresh();
                  }
                }}
              >
                {Icons.trash({ size: 14 })}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
