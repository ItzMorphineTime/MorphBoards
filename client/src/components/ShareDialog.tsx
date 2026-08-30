import { useCallback, useEffect, useState } from 'react';
import type { ShareInfo, ShareRole } from '@morphboards/shared';
import { api } from '../api/client';
import { useBoardStore } from '../state/boardStore';

const ROLE_META: { role: ShareRole; label: string; desc: string }[] = [
  { role: 'viewer', label: 'Read-only', desc: 'Can look around and follow along live' },
  { role: 'commenter', label: 'Comment-only', desc: 'Can add comment pins and reply' },
  { role: 'editor', label: 'Editor', desc: 'Full editing, uploads and export' },
];

export function ShareDialog({ onClose }: { onClose(): void }) {
  const boardId = useBoardStore((s) => s.boardId);
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [info, setInfo] = useState<{ port: number; hosts: string[]; bound: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!boardId) return;
    api
      .listShares(boardId)
      .then(setShares)
      .catch((err: Error) => setError(err.message));
  }, [boardId]);

  useEffect(() => {
    load();
    api
      .serverInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [load]);

  if (!boardId) return null;

  const linkBase = (() => {
    const onLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (info && onLocalhost && info.hosts.length > 0) {
      // guests can't use "localhost" — hand out a LAN address on the server port
      return `http://${info.hosts[0]}:${info.port}`;
    }
    if (info && onLocalhost) return `http://127.0.0.1:${info.port}`;
    return location.origin;
  })();

  const urlFor = (token: string) => `${linkBase}/#/s/${token}`;

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(urlFor(token));
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 1500);
    } catch {
      // clipboard blocked — the input below is selectable
    }
  };

  const boundLocalOnly = info !== null && info.bound === '127.0.0.1';

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="share-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="help-header">
          <span>Share this board</span>
          <button className="ghost-btn" onClick={onClose} title="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="share-body">
          {boundLocalOnly && (
            <div className="share-warning">
              The server is currently only reachable on this machine. Start it with{' '}
              <code>MORPH_HOST=0.0.0.0</code> so links work for other devices on your network.
            </div>
          )}
          {error && <div className="share-warning">{error}</div>}
          {ROLE_META.map(({ role, label, desc }) => {
            const share = shares.find((s) => s.role === role);
            return (
              <div key={role} className="share-row">
                <div className="share-row-head">
                  <div>
                    <div className="share-role">{label}</div>
                    <div className="share-desc">{desc}</div>
                  </div>
                  {share ? (
                    <div className="share-actions">
                      <button className="secondary-btn" onClick={() => void copy(share.token)}>
                        {copiedToken === share.token ? 'Copied!' : 'Copy link'}
                      </button>
                      <button
                        className="ghost-btn danger"
                        title="Revoke this link (kicks anyone using it)"
                        onClick={async () => {
                          await api.revokeShare(share.token);
                          load();
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 7h16M10 7V5h4v2m-7 0 1 13h8l1-13" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      className="secondary-btn"
                      onClick={async () => {
                        await api.createShare(boardId, role);
                        load();
                      }}
                    >
                      Create link
                    </button>
                  )}
                </div>
                {share && (
                  <input
                    className="panel-input share-url"
                    readOnly
                    value={urlFor(share.token)}
                    onFocus={(e) => e.target.select()}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
