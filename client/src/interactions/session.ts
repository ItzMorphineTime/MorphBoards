import type { Point } from '../geometry/geo';

export interface PointerSession {
  onMove?(e: PointerEvent): void;
  onEnd?(e: PointerEvent): void;
  onCancel?(): void;
}

let active: (() => void) | null = null;

/**
 * Track a drag from the given pointerdown until pointerup (Escape cancels).
 * Only one session can be active at a time.
 */
export function startPointerSession(session: PointerSession): void {
  cancelPointerSession();

  const onMove = (e: PointerEvent) => session.onMove?.(e);
  const onUp = (e: PointerEvent) => {
    cleanup();
    session.onEnd?.(e);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cleanup();
      session.onCancel?.();
    }
  };
  const cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey, true);
    active = null;
  };
  active = () => {
    cleanup();
    session.onCancel?.();
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey, true);
}

export function cancelPointerSession(): void {
  active?.();
}

export function hasActiveSession(): boolean {
  return active !== null;
}

/** Helper: has the pointer moved beyond a small threshold since `start`? */
export function passedThreshold(start: Point, e: PointerEvent, threshold = 3): boolean {
  return Math.abs(e.clientX - start.x) > threshold || Math.abs(e.clientY - start.y) > threshold;
}
