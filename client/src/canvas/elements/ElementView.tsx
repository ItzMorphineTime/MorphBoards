import { memo } from 'react';
import {
  handleElementDoubleClick,
  handleElementPointerDown,
  scheduleHoverClear,
  setHovered,
} from '../../interactions/interactions';
import { useBoardStore } from '../../state/boardStore';
import { useUiStore } from '../../state/uiStore';
import {
  CommentPinView,
  FrameView,
  ImageView,
  LinkView,
  ShapeView,
  StickyView,
  TextView,
} from './views';

export const ElementView = memo(function ElementView({ id }: { id: string }) {
  const el = useBoardStore((s) => s.elements[id]);
  const selected = useUiStore((s) => s.selectionSet.has(id));
  const editing = useUiStore((s) => s.editingId === id);
  const dropTarget = useUiStore((s) => s.dropFrameId === id);
  const connectTarget = useUiStore(
    (s) => s.connectorTargetId === id || s.draftConnector?.toElementId === id,
  );
  if (!el) return null;

  const cls = [
    'element',
    `el-${el.type}`,
    selected ? 'selected' : '',
    el.locked ? 'locked' : '',
    editing ? 'editing' : '',
    dropTarget ? 'drop-target' : '',
    connectTarget ? 'connect-target' : '',
  ]
    .filter(Boolean)
    .join(' ');

  let inner: React.ReactNode;
  switch (el.type) {
    case 'shape':
      inner = <ShapeView el={el} editing={editing} />;
      break;
    case 'text':
      inner = <TextView el={el} editing={editing} />;
      break;
    case 'sticky':
      inner = <StickyView el={el} editing={editing} />;
      break;
    case 'image':
      inner = <ImageView el={el} editing={editing} />;
      break;
    case 'link':
      inner = <LinkView el={el} editing={editing} />;
      break;
    case 'frame':
      inner = <FrameView el={el} editing={editing} />;
      break;
    case 'comment':
      inner = <CommentPinView el={el} editing={editing} />;
      break;
  }

  return (
    <div
      className={cls}
      data-element-id={id}
      style={
        el.type === 'comment'
          ? {
              // pins keep a constant screen size, pivoting on their tip
              transform: `translate(${el.x}px, ${el.y}px) scale(var(--inv-zoom, 1))`,
              transformOrigin: '0 100%',
              width: el.width,
              height: el.height,
            }
          : {
              transform: `translate(${el.x}px, ${el.y}px)`,
              width: el.width,
              height: el.height,
            }
      }
      onPointerDown={(e) => handleElementPointerDown(e, id)}
      onDoubleClick={(e) => handleElementDoubleClick(e, id)}
      onPointerEnter={() => {
        const u = useUiStore.getState();
        if (u.tool === 'select' && u.interaction === 'idle') setHovered(id);
      }}
      onPointerLeave={() => {
        if (useUiStore.getState().hoveredId === id) scheduleHoverClear(id);
      }}
    >
      {inner}
    </div>
  );
});
