import { create } from 'zustand';
import {
  type BoardDoc,
  type BoardElement,
  type BoardWithDoc,
  type Connector,
  SCHEMA_VERSION,
} from '@morphboards/shared';

export interface ElementDiff {
  before: BoardElement | null;
  after: BoardElement | null;
}
export interface ConnectorDiff {
  before: Connector | null;
  after: Connector | null;
}

export interface HistoryEntry {
  elements?: Record<string, ElementDiff>;
  connectors?: Record<string, ConnectorDiff>;
  order?: { before: string[]; after: string[] };
}

const HISTORY_LIMIT = 100;

interface TransientSession {
  elementsBefore: Record<string, BoardElement>;
  connectorsBefore: Record<string, Connector>;
}

export type ElementPatch = Partial<BoardElement> & Record<string, unknown>;
export type ConnectorPatch = Partial<Connector>;

interface BoardStore {
  boardId: string | null;
  name: string;
  loaded: boolean;
  elements: Record<string, BoardElement>;
  order: string[];
  connectors: Record<string, Connector>;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  /** Bumped on every committed change; autosave subscribes to this. */
  dirty: number;

  load(board: BoardWithDoc): void;
  unload(): void;
  setName(name: string): void;
  getDoc(): BoardDoc;

  addElements(els: BoardElement[]): void;
  /** Add elements and connectors, with optional element patches, as ONE undo step. */
  addMany(els: BoardElement[], connectors: Connector[], patches?: Record<string, ElementPatch>): void;
  updateElements(patches: Record<string, ElementPatch>): void;
  /** Update without creating a history entry (layout sync like text auto-height). */
  silentUpdate(patches: Record<string, ElementPatch>): void;
  /** Removes elements plus their connectors; unparents frame children and detaches pins. */
  removeElements(ids: string[]): void;
  addConnectors(cs: Connector[]): void;
  updateConnectors(patches: Record<string, ConnectorPatch>): void;
  removeConnectors(ids: string[]): void;
  removeMixed(elementIds: string[], connectorIds: string[]): void;
  reorder(ids: string[], mode: 'front' | 'back' | 'forward' | 'backward'): void;

  beginTransient(elementIds: string[], connectorIds?: string[]): void;
  applyTransient(
    elementPatches?: Record<string, ElementPatch>,
    connectorPatches?: Record<string, ConnectorPatch>,
  ): void;
  endTransient(extraElementPatches?: Record<string, ElementPatch>): void;
  cancelTransient(): void;

  undo(): void;
  redo(): void;
}

let session: TransientSession | null = null;

function mergeElement(prev: BoardElement, patch: ElementPatch): BoardElement {
  return { ...prev, ...patch } as BoardElement;
}

export const useBoardStore = create<BoardStore>()((set, get) => {
  function commitEntry(entry: HistoryEntry): void {
    if (!entry.elements && !entry.connectors && !entry.order) return;
    set((s) => {
      const elements = { ...s.elements };
      if (entry.elements) {
        for (const [id, diff] of Object.entries(entry.elements)) {
          if (diff.after === null) delete elements[id];
          else elements[id] = diff.after;
        }
      }
      const connectors = { ...s.connectors };
      if (entry.connectors) {
        for (const [id, diff] of Object.entries(entry.connectors)) {
          if (diff.after === null) delete connectors[id];
          else connectors[id] = diff.after;
        }
      }
      const undoStack = [...s.undoStack, entry].slice(-HISTORY_LIMIT);
      return {
        elements,
        connectors,
        order: entry.order ? [...entry.order.after] : s.order,
        undoStack,
        redoStack: [],
        dirty: s.dirty + 1,
      };
    });
  }

  function applyEntry(entry: HistoryEntry, dir: 'before' | 'after'): void {
    set((s) => {
      const elements = { ...s.elements };
      if (entry.elements) {
        for (const [id, diff] of Object.entries(entry.elements)) {
          const v = diff[dir];
          if (v === null) delete elements[id];
          else elements[id] = v;
        }
      }
      const connectors = { ...s.connectors };
      if (entry.connectors) {
        for (const [id, diff] of Object.entries(entry.connectors)) {
          const v = diff[dir];
          if (v === null) delete connectors[id];
          else connectors[id] = v;
        }
      }
      return {
        elements,
        connectors,
        order: entry.order ? [...entry.order[dir]] : s.order,
        dirty: s.dirty + 1,
      };
    });
  }

  return {
    boardId: null,
    name: '',
    loaded: false,
    elements: {},
    order: [],
    connectors: {},
    undoStack: [],
    redoStack: [],
    dirty: 0,

    load: (board) => {
      session = null;
      set({
        boardId: board.id,
        name: board.name,
        loaded: true,
        elements: board.doc.elements ?? {},
        order: board.doc.order ?? [],
        connectors: board.doc.connectors ?? {},
        undoStack: [],
        redoStack: [],
        dirty: 0,
      });
    },

    unload: () => {
      session = null;
      set({
        boardId: null,
        name: '',
        loaded: false,
        elements: {},
        order: [],
        connectors: {},
        undoStack: [],
        redoStack: [],
        dirty: 0,
      });
    },

    setName: (name) => set({ name }),

    getDoc: () => {
      const s = get();
      return {
        schemaVersion: SCHEMA_VERSION,
        elements: s.elements,
        order: s.order,
        connectors: s.connectors,
      };
    },

    addElements: (els) => {
      get().addMany(els, []);
    },

    addMany: (els, cs, patches) => {
      if (els.length === 0 && cs.length === 0) return;
      const s = get();
      const entry: HistoryEntry = { elements: {}, connectors: {} };
      if (els.length > 0) {
        entry.order = { before: s.order, after: [...s.order] };
        for (const el of els) {
          entry.elements![el.id] = { before: null, after: el };
          // frames render behind everything; keep them at the start of the order
          if (el.type === 'frame') entry.order.after.unshift(el.id);
          else entry.order.after.push(el.id);
        }
      }
      for (const c of cs) entry.connectors![c.id] = { before: null, after: c };
      if (patches) {
        for (const [id, patch] of Object.entries(patches)) {
          const existing = entry.elements![id];
          if (existing?.after) {
            entry.elements![id] = { ...existing, after: mergeElement(existing.after, patch) };
          } else if (s.elements[id]) {
            entry.elements![id] = {
              before: s.elements[id],
              after: mergeElement(s.elements[id], patch),
            };
          }
        }
      }
      commitEntry(entry);
    },

    updateElements: (patches) => {
      const s = get();
      const entry: HistoryEntry = { elements: {} };
      for (const [id, patch] of Object.entries(patches)) {
        const prev = s.elements[id];
        if (!prev) continue;
        entry.elements![id] = { before: prev, after: mergeElement(prev, patch) };
      }
      if (Object.keys(entry.elements!).length === 0) return;
      commitEntry(entry);
    },

    silentUpdate: (patches) => {
      set((s) => {
        const elements = { ...s.elements };
        let changed = false;
        for (const [id, patch] of Object.entries(patches)) {
          const prev = elements[id];
          if (!prev) continue;
          elements[id] = mergeElement(prev, patch);
          changed = true;
        }
        return changed ? { elements, dirty: s.dirty + 1 } : {};
      });
    },

    removeElements: (ids) => {
      get().removeMixed(ids, []);
    },

    addConnectors: (cs) => {
      if (cs.length === 0) return;
      const entry: HistoryEntry = { connectors: {} };
      for (const c of cs) entry.connectors![c.id] = { before: null, after: c };
      commitEntry(entry);
    },

    updateConnectors: (patches) => {
      const s = get();
      const entry: HistoryEntry = { connectors: {} };
      for (const [id, patch] of Object.entries(patches)) {
        const prev = s.connectors[id];
        if (!prev) continue;
        entry.connectors![id] = { before: prev, after: { ...prev, ...patch } };
      }
      if (Object.keys(entry.connectors!).length === 0) return;
      commitEntry(entry);
    },

    removeConnectors: (ids) => {
      get().removeMixed([], ids);
    },

    removeMixed: (elementIds, connectorIds) => {
      const s = get();
      const removing = new Set(elementIds.filter((id) => s.elements[id]));
      const entry: HistoryEntry = { elements: {}, connectors: {} };

      for (const id of removing) {
        entry.elements![id] = { before: s.elements[id], after: null };
      }
      // cascade: unparent children of removed frames, detach pins on removed elements
      for (const el of Object.values(s.elements)) {
        if (removing.has(el.id)) continue;
        if (el.frameId && removing.has(el.frameId)) {
          entry.elements![el.id] = { before: el, after: { ...el, frameId: null } };
        }
        if (el.type === 'comment' && el.attachedTo && removing.has(el.attachedTo)) {
          const prevDiff = entry.elements![el.id];
          const base = (prevDiff?.after ?? el) as BoardElement;
          entry.elements![el.id] = {
            before: prevDiff?.before ?? el,
            after: { ...base, attachedTo: null } as BoardElement,
          };
        }
      }
      // cascade: connectors touching removed elements
      const deadConnectors = new Set(connectorIds.filter((id) => s.connectors[id]));
      for (const c of Object.values(s.connectors)) {
        if (deadConnectors.has(c.id)) continue;
        const fromDead = c.from.kind === 'element' && removing.has(c.from.elementId);
        const toDead = c.to.kind === 'element' && removing.has(c.to.elementId);
        if (fromDead || toDead) deadConnectors.add(c.id);
      }
      for (const id of deadConnectors) {
        entry.connectors![id] = { before: s.connectors[id], after: null };
      }

      if (removing.size > 0) {
        entry.order = { before: s.order, after: s.order.filter((id) => !removing.has(id)) };
      }
      if (removing.size === 0 && deadConnectors.size === 0) return;
      commitEntry(entry);
    },

    reorder: (ids, mode) => {
      const s = get();
      const moving = new Set(ids.filter((id) => s.elements[id]));
      if (moving.size === 0) return;
      const rest = s.order.filter((id) => !moving.has(id));
      const movingInOrder = s.order.filter((id) => moving.has(id));
      let after: string[];
      if (mode === 'front') {
        after = [...rest, ...movingInOrder];
      } else if (mode === 'back') {
        after = [...movingInOrder, ...rest];
      } else {
        after = [...s.order];
        const step = mode === 'forward' ? 1 : -1;
        const indices = after
          .map((id, i) => (moving.has(id) ? i : -1))
          .filter((i) => i >= 0);
        if (step === 1) indices.reverse();
        for (const i of indices) {
          const j = i + step;
          if (j < 0 || j >= after.length || moving.has(after[j])) continue;
          [after[i], after[j]] = [after[j], after[i]];
        }
      }
      commitEntry({ order: { before: s.order, after } });
    },

    beginTransient: (elementIds, connectorIds = []) => {
      const s = get();
      const elementsBefore: Record<string, BoardElement> = {};
      for (const id of elementIds) {
        if (s.elements[id]) elementsBefore[id] = s.elements[id];
      }
      const connectorsBefore: Record<string, Connector> = {};
      for (const id of connectorIds) {
        if (s.connectors[id]) connectorsBefore[id] = s.connectors[id];
      }
      session = { elementsBefore, connectorsBefore };
    },

    applyTransient: (elementPatches, connectorPatches) => {
      if (!session) return;
      set((s) => {
        const next: Partial<BoardStore> = {};
        if (elementPatches) {
          const elements = { ...s.elements };
          for (const [id, patch] of Object.entries(elementPatches)) {
            const prev = elements[id];
            if (prev) elements[id] = mergeElement(prev, patch);
          }
          next.elements = elements;
        }
        if (connectorPatches) {
          const connectors = { ...s.connectors };
          for (const [id, patch] of Object.entries(connectorPatches)) {
            const prev = connectors[id];
            if (prev) connectors[id] = { ...prev, ...patch };
          }
          next.connectors = connectors;
        }
        return next;
      });
    },

    endTransient: (extraElementPatches) => {
      if (!session) return;
      if (extraElementPatches) get().applyTransient(extraElementPatches);
      const s = get();
      const entry: HistoryEntry = { elements: {}, connectors: {} };
      for (const [id, before] of Object.entries(session.elementsBefore)) {
        const after = s.elements[id];
        if (after && after !== before) entry.elements![id] = { before, after };
      }
      for (const [id, before] of Object.entries(session.connectorsBefore)) {
        const after = s.connectors[id];
        if (after && after !== before) entry.connectors![id] = { before, after };
      }
      session = null;
      if (
        Object.keys(entry.elements!).length === 0 &&
        Object.keys(entry.connectors!).length === 0
      ) {
        return;
      }
      // state already holds the "after" values; push entry without re-applying
      set((st) => ({
        undoStack: [...st.undoStack, entry].slice(-HISTORY_LIMIT),
        redoStack: [],
        dirty: st.dirty + 1,
      }));
    },

    cancelTransient: () => {
      if (!session) return;
      const { elementsBefore, connectorsBefore } = session;
      session = null;
      set((s) => {
        const elements = { ...s.elements };
        for (const [id, before] of Object.entries(elementsBefore)) {
          if (elements[id]) elements[id] = before;
        }
        const connectors = { ...s.connectors };
        for (const [id, before] of Object.entries(connectorsBefore)) {
          if (connectors[id]) connectors[id] = before;
        }
        return { elements, connectors };
      });
    },

    undo: () => {
      const s = get();
      const entry = s.undoStack[s.undoStack.length - 1];
      if (!entry) return;
      set({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, entry] });
      applyEntry(entry, 'before');
    },

    redo: () => {
      const s = get();
      const entry = s.redoStack[s.redoStack.length - 1];
      if (!entry) return;
      set({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, entry] });
      applyEntry(entry, 'after');
    },
  };
});

/** Non-frame children of a frame. */
export function frameChildren(
  elements: Record<string, BoardElement>,
  frameId: string,
): BoardElement[] {
  return Object.values(elements).filter((el) => el.frameId === frameId);
}

/** Count of frames, used for naming new ones. */
export function frameCount(elements: Record<string, BoardElement>): number {
  return Object.values(elements).filter((el) => el.type === 'frame').length;
}
