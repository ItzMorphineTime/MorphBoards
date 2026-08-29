import type {
  AssetUploadResult,
  BoardDoc,
  BoardListItem,
  BoardMeta,
  BoardWithDoc,
} from '@morphboards/shared';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
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
  exportUrl: (id: string) => `/api/boards/${id}/export`,
};
