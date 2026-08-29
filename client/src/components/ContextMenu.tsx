import {
  copySelection,
  deleteFrameWithContents,
  deleteSelection,
  duplicateSelection,
  selectAll,
  toggleLockSelection,
  unlockAll,
  zoomToFit,
} from '../interactions/actions';
import { pasteAt } from '../interactions/images';
import { frameChildren, useBoardStore } from '../state/boardStore';
import { useUiStore } from '../state/uiStore';

interface Item {
  label: string;
  kbd?: string;
  danger?: boolean;
  action(): void;
}

type Row = Item | 'sep';

export function ContextMenu() {
  const menu = useUiStore((s) => s.contextMenu);
  if (!menu) return null;

  const close = () => useUiStore.setState({ contextMenu: null });
  const s = useBoardStore.getState();
  const hasElements = menu.elementIds.length > 0;
  const hasAny = hasElements || menu.connectorIds.length > 0;
  const singleId = menu.elementIds.length === 1 ? menu.elementIds[0] : null;
  const frame = singleId && s.elements[singleId]?.type === 'frame' ? s.elements[singleId] : null;
  const anyLocked = menu.elementIds.some((id) => s.elements[id]?.locked);
  const at = { x: menu.worldX, y: menu.worldY };

  const rows: Row[] = [];
  if (hasAny) {
    if (hasElements) {
      rows.push(
        { label: 'Bring to front', kbd: 'Ctrl+Shift+]', action: () => s.reorder(menu.elementIds, 'front') },
        { label: 'Bring forward', kbd: 'Ctrl+]', action: () => s.reorder(menu.elementIds, 'forward') },
        { label: 'Send backward', kbd: 'Ctrl+[', action: () => s.reorder(menu.elementIds, 'backward') },
        { label: 'Send to back', kbd: 'Ctrl+Shift+[', action: () => s.reorder(menu.elementIds, 'back') },
        'sep',
      );
    }
    rows.push(
      { label: 'Copy', kbd: 'Ctrl+C', action: copySelection },
      { label: 'Duplicate', kbd: 'Ctrl+D', action: duplicateSelection },
      { label: 'Paste here', kbd: 'Ctrl+V', action: () => void pasteAt(at) },
    );
    if (hasElements) {
      rows.push('sep', {
        label: anyLocked ? 'Unlock' : 'Lock',
        action: toggleLockSelection,
      });
    }
    if (frame) {
      rows.push('sep');
      rows.push({
        label: 'Select frame contents',
        action: () => {
          const children = frameChildren(s.elements, frame.id).map((el) => el.id);
          useUiStore.getState().setSelection(children);
        },
      });
      rows.push({
        label: 'Delete frame + contents',
        danger: true,
        action: () => deleteFrameWithContents(frame.id),
      });
    }
    rows.push('sep', { label: 'Delete', kbd: 'Del', danger: true, action: deleteSelection });
  } else {
    rows.push(
      { label: 'Paste here', kbd: 'Ctrl+V', action: () => void pasteAt(at) },
      { label: 'Select all', kbd: 'Ctrl+A', action: selectAll },
      { label: 'Zoom to fit', kbd: 'Shift+1', action: zoomToFit },
      { label: 'Unlock all', action: unlockAll },
    );
  }

  const left = Math.min(menu.x, window.innerWidth - 230);
  const top = Math.min(menu.y, window.innerHeight - rows.length * 30 - 24);

  return (
    <>
      <div
        className="menu-backdrop"
        onPointerDown={close}
        onContextMenu={(e) => {
          e.preventDefault();
          close();
        }}
      />
      <div className="context-menu" style={{ left, top }}>
        {rows.map((row, i) =>
          row === 'sep' ? (
            <div key={i} className="menu-sep" />
          ) : (
            <button
              key={i}
              className={`menu-item ${row.danger ? 'danger' : ''}`}
              onClick={() => {
                close();
                row.action();
              }}
            >
              <span>{row.label}</span>
              {row.kbd && <span className="menu-kbd">{row.kbd}</span>}
            </button>
          ),
        )}
      </div>
    </>
  );
}
