import { create } from 'zustand';
import { type ActorInfo, type Capability, type PeerInfo, roleAtLeast } from '@morphboards/shared';

interface SessionState {
  /** 'solo' = classic local mode (no live connection); 'live' = WS session. */
  mode: 'solo' | 'live';
  role: Capability;
  shareToken: string | null;
  actor: ActorInfo | null;
  peers: PeerInfo[];
  connected: boolean;
  kickReason: string | null;
}

const initial: SessionState = {
  mode: 'solo',
  role: 'owner',
  shareToken: null,
  actor: null,
  peers: [],
  connected: false,
  kickReason: null,
};

export const useSessionStore = create<SessionState>()(() => ({ ...initial }));

export function resetSession(): void {
  useSessionStore.setState({ ...initial });
}

export const canEdit = (): boolean => roleAtLeast(useSessionStore.getState().role, 'editor');
export const canComment = (): boolean =>
  roleAtLeast(useSessionStore.getState().role, 'commenter');
export const isOwner = (): boolean => useSessionStore.getState().role === 'owner';

export const useCanEdit = (): boolean =>
  useSessionStore((s) => roleAtLeast(s.role, 'editor'));
export const useCanComment = (): boolean =>
  useSessionStore((s) => roleAtLeast(s.role, 'commenter'));
export const useIsOwner = (): boolean => useSessionStore((s) => s.role === 'owner');
