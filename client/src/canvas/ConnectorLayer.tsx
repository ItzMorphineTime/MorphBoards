import type { BoardElement, Connector } from '@morphboards/shared';
import {
  arrowheadPath,
  midpointOf,
  pathD,
  routeConnector,
} from '../geometry/connectorRouting';
import type { Point } from '../geometry/geo';
import {
  handleConnectorEndpointDown,
  handleConnectorPointerDown,
} from '../interactions/interactions';
import { useBoardStore } from '../state/boardStore';
import { useUiStore } from '../state/uiStore';
import { useViewportStore } from '../state/viewportStore';

/** Shorten the ends of a route so the line doesn't poke through arrowheads. */
function shortenForArrows(route: Point[], start: number, end: number): Point[] {
  if (route.length < 2) return route;
  const pts = route.map((p) => ({ ...p }));
  const trim = (tipIdx: number, prevIdx: number, by: number) => {
    const tip = pts[tipIdx];
    const prev = pts[prevIdx];
    const len = Math.hypot(tip.x - prev.x, tip.y - prev.y);
    if (len <= by) return;
    const t = (len - by) / len;
    pts[tipIdx] = { x: prev.x + (tip.x - prev.x) * t, y: prev.y + (tip.y - prev.y) * t };
  };
  if (start > 0) trim(0, 1, start);
  if (end > 0) trim(pts.length - 1, pts.length - 2, end);
  return pts;
}

function ConnectorPath({
  c,
  elements,
  zoom,
  selected,
  interactive,
}: {
  c: Connector;
  elements: Record<string, BoardElement>;
  zoom: number;
  selected: boolean;
  interactive: boolean;
}) {
  const route = routeConnector(c, elements);
  const arrowSize = 5 + c.strokeWidth * 2.2;
  const drawn = shortenForArrows(
    route,
    c.arrowStart ? arrowSize * 0.7 : 0,
    c.arrowEnd ? arrowSize * 0.7 : 0,
  );
  const d = pathD(drawn, c.routing === 'elbow' ? 8 : 0);
  const mid = c.label ? midpointOf(route) : null;
  const handleR = 5 / zoom;

  return (
    <g>
      {selected && (
        <path
          d={d}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={c.strokeWidth + 5 / zoom}
          opacity={0.3}
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={c.stroke}
        strokeWidth={c.strokeWidth}
        strokeLinecap="round"
      />
      {c.arrowEnd && <path d={arrowheadPath(route, false, arrowSize)} fill={c.stroke} />}
      {c.arrowStart && <path d={arrowheadPath(route, true, arrowSize)} fill={c.stroke} />}
      {mid && c.label && (
        <g>
          <rect
            x={mid.x - (c.label.length * 7.5) / 2 - 6}
            y={mid.y - 11}
            width={c.label.length * 7.5 + 12}
            height={22}
            rx={5}
            fill="var(--panel)"
            stroke="var(--panel-border)"
            strokeWidth={1 / zoom}
          />
          <text
            x={mid.x}
            y={mid.y + 4.5}
            textAnchor="middle"
            fontSize={13}
            fill="var(--text)"
            style={{ userSelect: 'none' }}
          >
            {c.label}
          </text>
        </g>
      )}
      {interactive && (
        <path
          d={pathD(route, 0)}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(12 / zoom, c.strokeWidth + 8 / zoom)}
          style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
          onPointerDown={(e) => handleConnectorPointerDown(e, c.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            useUiStore.setState({ editingLabelId: c.id });
          }}
        />
      )}
      {selected && interactive && (
        <>
          <circle
            cx={route[0].x}
            cy={route[0].y}
            r={handleR}
            className="connector-endpoint"
            onPointerDown={(e) => handleConnectorEndpointDown(e, c.id, 'from')}
          />
          <circle
            cx={route[route.length - 1].x}
            cy={route[route.length - 1].y}
            r={handleR}
            className="connector-endpoint"
            onPointerDown={(e) => handleConnectorEndpointDown(e, c.id, 'to')}
          />
        </>
      )}
    </g>
  );
}

export function ConnectorLayer() {
  const connectors = useBoardStore((s) => s.connectors);
  const elements = useBoardStore((s) => s.elements);
  const zoom = useViewportStore((s) => s.zoom);
  const selectedConnectors = useUiStore((s) => s.selectedConnectors);
  const draft = useUiStore((s) => s.draftConnector);
  const interactive = useUiStore((s) => s.tool === 'select');

  let draftNode: React.ReactNode = null;
  if (draft) {
    const temp: Connector = {
      id: '__draft',
      from: draft.from,
      to: draft.toElementId
        ? { kind: 'element', elementId: draft.toElementId, side: 'auto' }
        : { kind: 'point', x: draft.toPoint.x, y: draft.toPoint.y },
      routing: draft.routing,
      arrowStart: false,
      arrowEnd: draft.arrowEnd,
      stroke: 'var(--accent)',
      strokeWidth: 2,
    };
    const route = routeConnector(temp, elements);
    draftNode = (
      <g>
        <path
          d={pathD(route, temp.routing === 'elbow' ? 8 : 0)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2 / Math.max(zoom, 0.05)}
          strokeDasharray={`${6 / zoom} ${5 / zoom}`}
        />
        {draft.arrowEnd && (
          <path d={arrowheadPath(route, false, 10 / zoom)} fill="var(--accent)" />
        )}
      </g>
    );
  }

  return (
    <svg className="connector-layer">
      {Object.values(connectors).map((c) => (
        <ConnectorPath
          key={c.id}
          c={c}
          elements={elements}
          zoom={zoom}
          selected={selectedConnectors.includes(c.id)}
          interactive={interactive}
        />
      ))}
      {draftNode}
    </svg>
  );
}
