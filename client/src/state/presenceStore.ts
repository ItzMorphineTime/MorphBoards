import { create } from 'zustand';

export interface PeerPresence {
  cursor: { x: number; y: number } | null;
  selection: string[];
}

interface PresenceState {
  byPeer: Record<string, PeerPresence>;
}

/** Ephemeral per-peer cursor/selection state (high-frequency updates). */
export const usePresenceStore = create<PresenceState>()(() => ({ byPeer: {} }));

export function setPeerPresence(peerId: string, presence: PeerPresence): void {
  usePresenceStore.setState((s) => ({ byPeer: { ...s.byPeer, [peerId]: presence } }));
}

export function removePeerPresence(peerId: string): void {
  usePresenceStore.setState((s) => {
    if (!(peerId in s.byPeer)) return s;
    const byPeer = { ...s.byPeer };
    delete byPeer[peerId];
    return { byPeer };
  });
}

export function clearPresence(): void {
  usePresenceStore.setState({ byPeer: {} });
}
