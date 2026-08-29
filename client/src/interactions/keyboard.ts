import { useBoardStore, type ElementPatch } from '../state/boardStore';
import { useUiStore, type Tool } from '../state/uiStore';
import { useViewportStore } from '../state/viewportStore';
import {
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  moveClosure,
  selectAll,
  zoomToFit,
  zoomToSelection,
} from './actions';

const board = () => useBoardStore.getState();
const ui = () => useUiStore.getState();
const uiSet = useUiStore.setState;

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  h: 'pan',
  s: 'shape',
  n: 'sticky',
  t: 'text',
  f: 'frame',
  l: 'line',
  c: 'connector',
  m: 'comment',
};

function nudgeSelection(dx: number, dy: number): void {
  const ids = moveClosure(ui().selection);
  if (ids.size === 0) return;
  const { elements } = board();
  const patches: Record<string, ElementPatch> = {};
  for (const id of ids) {
    const el = elements[id];
    if (el) patches[id] = { x: el.x + dx, y: el.y + dy };
  }
  board().updateElements(patches);
}

function handleEscape(): void {
  const u = ui();
  if (u.contextMenu) {
    uiSet({ contextMenu: null });
    return;
  }
  if (u.helpOpen) {
    uiSet({ helpOpen: false });
    return;
  }
  if (u.openCommentId) {
    uiSet({ openCommentId: null });
    return;
  }
  if (u.editingId) {
    u.setEditing(null);
    return;
  }
  if (u.selection.length > 0 || u.selectedConnectors.length > 0) {
    u.clearSelection();
    return;
  }
  if (u.tool !== 'select') u.setTool('select');
}

export function installKeyboard(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const editable =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      Boolean(target?.isContentEditable);
    if (editable) {
      if (e.key === 'Escape') target?.blur();
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;
    const viewport = useViewportStore.getState();

    if (key === ' ') {
      if (!e.repeat) uiSet({ spaceDown: true });
      e.preventDefault();
      return;
    }
    if (key === 'Escape') {
      handleEscape();
      return;
    }

    if (mod) {
      switch (key.toLowerCase()) {
        case 'z':
          e.preventDefault();
          if (e.shiftKey) board().redo();
          else board().undo();
          return;
        case 'y':
          e.preventDefault();
          board().redo();
          return;
        case 'a':
          e.preventDefault();
          selectAll();
          return;
        case 'c':
          copySelection();
          return;
        case 'x':
          cutSelection();
          return;
        case 'd':
          e.preventDefault();
          duplicateSelection();
          return;
        case '=':
        case '+':
          e.preventDefault();
          viewport.zoomStep(1);
          return;
        case '-':
          e.preventDefault();
          viewport.zoomStep(-1);
          return;
        case '0':
          e.preventDefault();
          viewport.setZoomCentered(1);
          return;
        case '[':
          e.preventDefault();
          board().reorder(ui().selection, e.shiftKey ? 'back' : 'backward');
          return;
        case ']':
          e.preventDefault();
          board().reorder(ui().selection, e.shiftKey ? 'front' : 'forward');
          return;
        default:
          return;
      }
    }

    switch (key) {
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        deleteSelection();
        return;
      case 'ArrowLeft':
        e.preventDefault();
        nudgeSelection(e.shiftKey ? -10 : -1, 0);
        return;
      case 'ArrowRight':
        e.preventDefault();
        nudgeSelection(e.shiftKey ? 10 : 1, 0);
        return;
      case 'ArrowUp':
        e.preventDefault();
        nudgeSelection(0, e.shiftKey ? -10 : -1);
        return;
      case 'ArrowDown':
        e.preventDefault();
        nudgeSelection(0, e.shiftKey ? 10 : 1);
        return;
      case '?':
        uiSet({ helpOpen: !ui().helpOpen });
        return;
      case '!':
        zoomToFit();
        return;
      case '@':
        zoomToSelection();
        return;
    }

    const tool = TOOL_KEYS[key.toLowerCase()];
    if (tool && !e.altKey) ui().setTool(tool);
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ') uiSet({ spaceDown: false });
  };
  const onBlur = () => uiSet({ spaceDown: false });

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
