import { create } from 'zustand';
import {
  clamp,
  MAX_ZOOM,
  MIN_ZOOM,
  type Point,
  type Rect,
  fitViewport,
  zoomAt,
} from '../geometry/geo';

interface ViewportStore {
  x: number;
  y: number;
  zoom: number;
  size: { width: number; height: number };

  setViewport(vp: { x: number; y: number; zoom: number }): void;
  setSize(width: number, height: number): void;
  panBy(dx: number, dy: number): void;
  zoomAtPoint(screenPt: Point, newZoom: number): void;
  zoomStep(direction: 1 | -1, screenPt?: Point): void;
  setZoomCentered(zoom: number): void;
  fitBounds(bounds: Rect): void;
}

export const useViewportStore = create<ViewportStore>()((set, get) => ({
  x: 0,
  y: 0,
  zoom: 1,
  size: { width: 1200, height: 800 },

  setViewport: (vp) => set({ x: vp.x, y: vp.y, zoom: clamp(vp.zoom, MIN_ZOOM, MAX_ZOOM) }),
  setSize: (width, height) => set({ size: { width, height } }),
  panBy: (dx, dy) => set((s) => ({ x: s.x + dx, y: s.y + dy })),
  zoomAtPoint: (screenPt, newZoom) => {
    const s = get();
    set(zoomAt(s, screenPt, newZoom));
  },
  zoomStep: (direction, screenPt) => {
    const s = get();
    const center = screenPt ?? { x: s.size.width / 2, y: s.size.height / 2 };
    const factor = direction === 1 ? 1.25 : 1 / 1.25;
    set(zoomAt(s, center, s.zoom * factor));
  },
  setZoomCentered: (zoom) => {
    const s = get();
    set(zoomAt(s, { x: s.size.width / 2, y: s.size.height / 2 }, zoom));
  },
  fitBounds: (bounds) => {
    const s = get();
    set(fitViewport(bounds, s.size.width, s.size.height));
  },
}));

/** Current viewport for non-React code (interactions, autosave). */
export function getViewport(): { x: number; y: number; zoom: number } {
  const { x, y, zoom } = useViewportStore.getState();
  return { x, y, zoom };
}

export function screenToWorldPt(p: Point): Point {
  const { x, y, zoom } = useViewportStore.getState();
  return { x: (p.x - x) / zoom, y: (p.y - y) / zoom };
}
