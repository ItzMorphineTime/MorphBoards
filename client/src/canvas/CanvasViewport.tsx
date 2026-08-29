import { useEffect, useRef } from 'react';
import {
  handleCanvasContextMenu,
  handleCanvasPointerDown,
  setCanvasEl,
  trackPointer,
} from '../interactions/interactions';
import { handleCanvasDragOver, handleCanvasDrop } from '../interactions/images';
import { useUiStore } from '../state/uiStore';
import { useViewportStore } from '../state/viewportStore';
import { ConnectorLayer } from './ConnectorLayer';
import { Overlay } from './Overlay';
import { WorldLayer } from './WorldLayer';

const BASE_GRID = 24;

function applyViewportToDom(root: HTMLDivElement, world: HTMLDivElement): void {
  const { x, y, zoom } = useViewportStore.getState();
  world.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;

  if (zoom < 0.08) {
    root.style.backgroundImage = 'none';
    return;
  }
  let worldStep = BASE_GRID;
  while (worldStep * zoom < 18) worldStep *= 4;
  const step = worldStep * zoom;
  root.style.backgroundImage = 'radial-gradient(circle, var(--grid-dot) 1px, transparent 1.5px)';
  root.style.backgroundSize = `${step}px ${step}px`;
  root.style.backgroundPosition = `${x % step}px ${y % step}px`;
}

export function CanvasViewport() {
  const rootRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);

  // Register the canvas element + track its size
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    setCanvasEl(root);
    const ro = new ResizeObserver(() => {
      useViewportStore.getState().setSize(root.clientWidth, root.clientHeight);
    });
    ro.observe(root);
    useViewportStore.getState().setSize(root.clientWidth, root.clientHeight);
    return () => {
      ro.disconnect();
      setCanvasEl(null);
    };
  }, []);

  // Pan/zoom: write the transform straight to the DOM on a rAF, outside React
  useEffect(() => {
    const root = rootRef.current;
    const world = worldRef.current;
    if (!root || !world) return;
    let raf = 0;
    applyViewportToDom(root, world);
    const unsub = useViewportStore.subscribe(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        applyViewportToDom(root, world);
      });
    });
    return () => {
      unsub();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Wheel: ctrl/cmd = zoom at cursor, otherwise pan (needs a non-passive listener)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vp = useViewportStore.getState();
      if (e.ctrlKey || e.metaKey) {
        const rect = root.getBoundingClientRect();
        const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        vp.zoomAtPoint(pt, vp.zoom * Math.exp(-e.deltaY * 0.0022));
      } else if (e.shiftKey && e.deltaX === 0) {
        vp.panBy(-e.deltaY, 0);
      } else {
        vp.panBy(-e.deltaX, -e.deltaY);
      }
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, []);

  const tool = useUiStore((s) => s.tool);
  const spaceDown = useUiStore((s) => s.spaceDown);
  const interaction = useUiStore((s) => s.interaction);

  const cursor =
    interaction === 'pan'
      ? 'grabbing'
      : spaceDown || tool === 'pan'
        ? 'grab'
        : tool === 'select'
          ? 'default'
          : 'crosshair';

  return (
    <div
      ref={rootRef}
      className="canvas-root"
      style={{ cursor }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={trackPointer}
      onContextMenu={handleCanvasContextMenu}
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
    >
      <div ref={worldRef} className="world">
        <WorldLayer />
        <ConnectorLayer />
      </div>
      <Overlay />
    </div>
  );
}
