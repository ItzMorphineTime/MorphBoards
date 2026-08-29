import { create } from 'zustand';
import type { Attachment, ConnectorRouting, ShapeKind } from '@morphboards/shared';
import type { Point, Rect } from '../geometry/geo';

export type Tool =
  | 'select'
  | 'pan'
  | 'shape'
  | 'sticky'
  | 'text'
  | 'frame'
  | 'line'
  | 'connector'
  | 'comment';

export type InteractionKind = 'idle' | 'pan' | 'marquee' | 'move' | 'resize' | 'draw' | 'connect';

export interface DraftConnector {
  from: Attachment;
  toPoint: Point;
  /** Element currently snapped as the target. */
  toElementId: string | null;
  routing: ConnectorRouting;
  arrowEnd: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  /** World position of the click (for "paste here"). */
  worldX: number;
  worldY: number;
  /** Element/connector ids the menu acts on (usually the selection). */
  elementIds: string[];
  connectorIds: string[];
}

interface UiStore {
  tool: Tool;
  shapeKind: ShapeKind;
  selection: string[];
  selectionSet: Set<string>;
  selectedConnectors: string[];
  editingId: string | null;
  editingLabelId: string | null;
  hoveredId: string | null;
  interaction: InteractionKind;
  marquee: Rect | null;
  draftShape: (Rect & { tool: 'shape' | 'frame' }) | null;
  draftConnector: DraftConnector | null;
  /** Element highlighted as a connector target while re-dragging an endpoint. */
  connectorTargetId: string | null;
  dropFrameId: string | null;
  contextMenu: ContextMenuState | null;
  openCommentId: string | null;
  commentsSidebarOpen: boolean;
  helpOpen: boolean;
  spaceDown: boolean;

  setTool(tool: Tool): void;
  setShapeKind(kind: ShapeKind): void;
  setSelection(elementIds: string[], connectorIds?: string[]): void;
  toggleSelected(id: string): void;
  clearSelection(): void;
  setEditing(id: string | null): void;
}

export const useUiStore = create<UiStore>()((set, get) => ({
  tool: 'select',
  shapeKind: 'rect',
  selection: [],
  selectionSet: new Set(),
  selectedConnectors: [],
  editingId: null,
  editingLabelId: null,
  hoveredId: null,
  interaction: 'idle',
  marquee: null,
  draftShape: null,
  draftConnector: null,
  connectorTargetId: null,
  dropFrameId: null,
  contextMenu: null,
  openCommentId: null,
  commentsSidebarOpen: false,
  helpOpen: false,
  spaceDown: false,

  setTool: (tool) =>
    set({ tool, contextMenu: null, ...(tool !== 'select' ? { hoveredId: null } : null) }),
  setShapeKind: (kind) => set({ shapeKind: kind, tool: 'shape' }),
  setSelection: (elementIds, connectorIds = []) =>
    set({
      selection: elementIds,
      selectionSet: new Set(elementIds),
      selectedConnectors: connectorIds,
    }),
  toggleSelected: (id) => {
    const { selection } = get();
    const next = selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id];
    set({ selection: next, selectionSet: new Set(next) });
  },
  clearSelection: () =>
    set({ selection: [], selectionSet: new Set(), selectedConnectors: [], openCommentId: null }),
  setEditing: (id) => set({ editingId: id }),
}));

/** Convenience for non-React modules. */
export const ui = {
  get: () => useUiStore.getState(),
  set: useUiStore.setState,
};
