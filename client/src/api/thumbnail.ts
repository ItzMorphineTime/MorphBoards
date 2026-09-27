import type { BoardElement } from '@morphboards/shared';
import { unionRects } from '../geometry/geo';

// sized for a ~260 px board card on a 2x display
const W = 480;
const H = 270;

/** Paint a small schematic of the board: colored boxes plus any loaded images. */
export function generateThumbnail(
  elements: Record<string, BoardElement>,
  order: readonly string[],
): string | undefined {
  const all = order.map((id) => elements[id]).filter((el): el is BoardElement => Boolean(el));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  const bounds = unionRects(all);
  if (bounds && all.length > 0) {
    const pad = 20;
    const scale = Math.min(
      (W - pad * 2) / Math.max(bounds.width, 1),
      (H - pad * 2) / Math.max(bounds.height, 1),
      1,
    );
    const ox = W / 2 - (bounds.x + bounds.width / 2) * scale;
    const oy = H / 2 - (bounds.y + bounds.height / 2) * scale;

    const frames = all.filter((el) => el.type === 'frame');
    const rest = all.filter((el) => el.type !== 'frame');
    for (const el of [...frames, ...rest]) {
      const x = el.x * scale + ox;
      const y = el.y * scale + oy;
      const w = Math.max(el.width * scale, 2);
      const h = Math.max(el.height * scale, 2);
      switch (el.type) {
        case 'frame':
          ctx.fillStyle = 'rgba(255,255,255,0.04)';
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = 'rgba(255,255,255,0.22)';
          ctx.strokeRect(x, y, w, h);
          break;
        case 'sticky':
          ctx.fillStyle = el.color;
          ctx.fillRect(x, y, w, h);
          break;
        case 'shape':
          ctx.fillStyle = el.fill === 'transparent' ? 'rgba(255,255,255,0.18)' : el.fill;
          ctx.fillRect(x, y, w, h);
          break;
        case 'image': {
          // same-origin assets already decoded on the canvas keep the
          // thumbnail untainted, so draw the real picture when we can
          const img = document.querySelector<HTMLImageElement>(
            `[data-element-id="${el.id}"] img`,
          );
          if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, x, y, w, h);
          } else {
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(x, y, w, h);
          }
          break;
        }
        case 'link':
          ctx.fillStyle = '#1f1f1f';
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = '#c51622';
          ctx.fillRect(x + h * 0.2, y + h * 0.2, h * 0.6, h * 0.6);
          break;
        case 'text':
          ctx.fillStyle = '#6c6c6c';
          ctx.fillRect(x, y + h * 0.3, w, Math.max(h * 0.4, 2));
          break;
        case 'comment':
          ctx.fillStyle = '#f2b705';
          ctx.beginPath();
          ctx.arc(x + w / 2, y + h / 2, Math.max(w / 2, 2), 0, Math.PI * 2);
          ctx.fill();
          break;
      }
    }
  }
  return canvas.toDataURL('image/png');
}
