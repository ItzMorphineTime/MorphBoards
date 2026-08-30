import type { BoardElement } from '@morphboards/shared';
import { unionRects, worldRectToScreen, worldToScreen } from '../geometry/geo';
import { useBoardStore } from '../state/boardStore';
import { usePresenceStore } from '../state/presenceStore';
import { useSessionStore } from '../state/sessionStore';
import { useViewportStore } from '../state/viewportStore';

/** Remote cursors and selection outlines (screen-space, inside the Overlay). */
export function PresenceLayer() {
  const byPeer = usePresenceStore((s) => s.byPeer);
  const peers = useSessionStore((s) => s.peers);
  const vp = useViewportStore();
  const elements = useBoardStore((s) => s.elements);

  if (peers.length === 0) return null;

  return (
    <>
      {peers.map((peer) => {
        const presence = byPeer[peer.peerId];
        if (!presence) return null;
        const nodes: React.ReactNode[] = [];

        if (presence.selection.length > 0) {
          const els = presence.selection
            .map((id) => elements[id])
            .filter((el): el is BoardElement => Boolean(el));
          const bounds = unionRects(els);
          if (bounds) {
            const r = worldRectToScreen(vp, bounds);
            nodes.push(
              <div
                key="sel"
                className="peer-selection"
                style={{
                  left: r.x,
                  top: r.y,
                  width: r.width,
                  height: r.height,
                  borderColor: peer.color,
                }}
              />,
            );
          }
        }

        if (presence.cursor) {
          const p = worldToScreen(vp, presence.cursor);
          if (p.x > -80 && p.y > -80 && p.x < vp.size.width + 80 && p.y < vp.size.height + 80) {
            nodes.push(
              <div key="cur" className="peer-cursor" style={{ left: p.x, top: p.y }}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M5 3l14 7.5-6.2 1.9L10 19 5 3z" fill={peer.color} stroke="#fff" strokeWidth="1.2" />
                </svg>
                <span className="peer-cursor-name" style={{ background: peer.color }}>
                  {peer.name}
                </span>
              </div>,
            );
          }
        }

        return nodes.length > 0 ? <div key={peer.peerId}>{nodes}</div> : null;
      })}
    </>
  );
}
