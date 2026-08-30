import type {
  ActorInfo,
  AssetUploadResult,
  BoardDoc,
  BoardListItem,
  BoardMeta,
  BoardWithDoc,
  ShareInfo,
  ShareRole,
} from '@morphboards/shared';

/** Share token attached to every API call in a guest session. */
let apiShareToken: string | null = null;

export function setApiShareToken(token: string | null): void {
  apiShareToken = token;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = {
    ...((init?.headers as Record<string, string>) ?? {}),
    ...(apiShareToken ? { 'x-share-token': apiShareToken } : {}),
  };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const api = {
  listBoards: () => request<BoardListItem[]>('/api/boards'),
  createBoard: (name?: string) => request<BoardWithDoc>('/api/boards', jsonInit('POST', { name })),
  getBoard: (id: string) => request<BoardWithDoc>(`/api/boards/${id}`),
  saveBoard: (id: string, doc: BoardDoc, thumbnail?: string) =>
    request<{ updatedAt: number }>(`/api/boards/${id}`, jsonInit('PUT', { doc, thumbnail })),
  renameBoard: (id: string, name: string) =>
    request<{ ok: true }>(`/api/boards/${id}`, jsonInit('PATCH', { name })),
  deleteBoard: (id: string) => request<{ ok: true }>(`/api/boards/${id}`, { method: 'DELETE' }),
  duplicateBoard: (id: string) =>
    request<BoardMeta>(`/api/boards/${id}/duplicate`, { method: 'POST' }),
  copyAsset: (boardId: string, sourceUrl: string) =>
    request<AssetUploadResult>(
      `/api/boards/${boardId}/assets/copy`,
      jsonInit('POST', { sourceUrl }),
    ),
  uploadAsset: (boardId: string, file: File | Blob, filename?: string) => {
    const form = new FormData();
    form.append('file', file, filename ?? (file instanceof File ? file.name : 'pasted.png'));
    return request<AssetUploadResult>(`/api/boards/${boardId}/assets`, {
      method: 'POST',
      body: form,
    });
  },
  importBoard: (file: File) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return request<BoardMeta>('/api/import', { method: 'POST', body: form });
  },
  exportUrl: (id: string) =>
    `/api/boards/${id}/export${apiShareToken ? `?share=${apiShareToken}` : ''}`,

  // sharing & identity
  me: () => request<{ actor: ActorInfo | null; googleEnabled: boolean }>('/api/me'),
  setIdentity: (name: string) =>
    request<{ ok: true; name: string }>('/api/identity', jsonInit('POST', { name })),
  getShared: (token: string) =>
    request<{ board: { id: string; name: string }; role: ShareRole; doc: BoardDoc }>(
      `/api/shared/${token}`,
    ),
  listShares: (boardId: string) => request<ShareInfo[]>(`/api/boards/${boardId}/shares`),
  createShare: (boardId: string, role: ShareRole) =>
    request<ShareInfo>(`/api/boards/${boardId}/shares`, jsonInit('POST', { role })),
  revokeShare: (token: string) =>
    request<{ ok: true }>(`/api/shares/${token}`, { method: 'DELETE' }),
  serverInfo: () =>
    request<{ port: number; hosts: string[]; bound: string }>('/api/server-info'),
  postThumbnail: (boardId: string, dataUrl: string) =>
    request<{ ok: true }>(`/api/boards/${boardId}/thumbnail`, jsonInit('POST', { dataUrl })),
};
