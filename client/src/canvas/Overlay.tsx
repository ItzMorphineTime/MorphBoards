import { useState } from 'react';
import type { BoardElement } from '@morphboards/shared';
import { midpointOf, routeConnector, sideMidpoint, type Side } from '../geometry/connectorRouting';
import { type Rect, unionRects, worldRectToScreen, worldToScreen } from '../geometry/geo';
import type { HandleDir } from '../geometry/resizeBox';
import {
  handlePortPointerDown,
  handleResizeHandleDown,
  keepHover,
} from '../interactions/interactions';
import { useBoardStore } from '../state/boardStore';
import { useUiStore } from '../state/uiStore';
import { useViewportStore } from '../state/viewportStore';
import { CommentPopover } from '../components/CommentPopover';
import { PresenceLayer } from './PresenceLayer';

const HANDLE_CURSOR: Record<HandleDir, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

function handlesFor(els: BoardElement[]): HandleDir[] {
  if (els.length === 0) return [];
  if (els.length > 1) return ['nw', 'ne', 'se', 'sw'];
  const el = els[0];
  switch (el.type) {
    case 'comment':
      return [];
    case 'image':
      return ['nw', 'ne', 'se', 'sw'];
    case 'text':
      return ['nw', 'ne', 'se', 'sw', 'e', 'w'];
    default:
      return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  }
}

function handlePos(box: Rect, dir: HandleDir): { left: number; top: number } {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const x = dir.includes('w') ? box.x : dir.includes('e') ? box.x + box.width : cx;
  const y = dir.includes('n') ? box.y : dir.includes('s') ? box.y + box.height : cy;
  return { left: x, top: y };
}

function ConnectorLabelEditor() {
  const editingLabelId = useUiStore((s) => s.editingLabelId);
  const vp = useViewportStore();
  const [text, setText] = useState<string | null>(null);
  if (!editingLabelId) return null;
  const s = useBoardStore.getState();
  const c = s.connectors[editingLabelId];
  if (!c) return null;
  const mid = worldToScreen(vp, midpointOf(routeConnector(c, s.elements)));
  const value = text ?? c.label ?? '';
  const commit = () => {
    s.updateConnectors({ [editingLabelId]: { label: value.trim() || undefined } });
    useUiStore.setState({ editingLabelId: null });
  };
  return (
    <input
      className="connector-label-input"
      style={{ left: mid.x, top: mid.y }}
      value={value}
      autoFocus
      placeholder="Label"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') commit();
      }}
    />
  );
}

const PORT_SIDES: Side[] = ['n', 'e', 's', 'w'];
const PORT_OFFSET = 16;

export function Overlay() {
  const vp = useViewportStore();
  const selection = useUiStore((s) => s.selection);
  const interaction = useUiStore((s) => s.interaction);
  const marquee = useUiStore((s) => s.marquee);
  const draftShape = useUiStore((s) => s.draftShape);
  const hoveredId = useUiStore((s) => s.hoveredId);
  const dropFrameId = useUiStore((s) => s.dropFrameId);
  const editingId = useUiStore((s) => s.editingId);
  const tool = useUiStore((s) => s.tool);
  const elements = useBoardStore((s) => s.elements);

  const selectedEls = selection
    .map((id) => elements[id])
    .filter((el): el is BoardElement => Boolean(el) && !el.locked);
  const bbox = unionRects(selectedEls);
  const showBox = bbox && interaction !== 'marquee' && interaction !== 'connect' && !editingId;
  const showHandles = showBox && (interaction === 'idle' || interaction === 'resize');
  const screenBox = bbox ? worldRectToScreen(vp, bbox) : null;

  const hovered = hoveredId ? elements[hoveredId] : null;
  const showPorts =
    tool === 'select' &&
    interaction === 'idle' &&
    hovered &&
    !hovered.locked &&
    hovered.type !== 'comment';

  const dropFrame = dropFrameId ? elements[dropFrameId] : null;

  return (
    <div className="overlay">
      {dropFrame && (
        <div className="drop-frame-highlight" style={rectStyle(worldRectToScreen(vp, dropFrame))} />
      )}

      {marquee && <div className="marquee" style={rectStyle(worldRectToScreen(vp, marquee))} />}

      {draftShape && (
        <div
          className={`draft-shape draft-${draftShape.tool}`}
          style={rectStyle(worldRectToScreen(vp, draftShape))}
        />
      )}

      {screenBox && showBox && (
        <div className="selection-box" style={rectStyle(screenBox)}>
          {showHandles &&
            handlesFor(selectedEls).map((dir) => {
              const pos = handlePos(
                { x: 0, y: 0, width: screenBox.width, height: screenBox.height },
                dir,
              );
              return (
                <div
                  key={dir}
                  className="resize-handle"
                  style={{ left: pos.left, top: pos.top, cursor: HANDLE_CURSOR[dir] }}
                  onPointerDown={(e) => handleResizeHandleDown(e, dir)}
                />
              );
            })}
        </div>
      )}

      {showPorts &&
        hovered &&
        PORT_SIDES.map((side) => {
          const world = sideMidpoint(hovered, side);
          const screen = worldToScreen(vp, world);
          const dx = side === 'e' ? PORT_OFFSET : side === 'w' ? -PORT_OFFSET : 0;
          const dy = side === 's' ? PORT_OFFSET : side === 'n' ? -PORT_OFFSET : 0;
          return (
            <div
              key={side}
              className="port"
              style={{ left: screen.x + dx, top: screen.y + dy }}
              onPointerEnter={keepHover}
              onPointerDown={(e) => handlePortPointerDown(e, hovered.id, side)}
            />
          );
        })}

      <PresenceLayer />
      <ConnectorLabelEditor />
      <CommentPopover />
    </div>
  );
}

function rectStyle(r: Rect): React.CSSProperties {
  return { left: r.x, top: r.y, width: r.width, height: r.height };
}
