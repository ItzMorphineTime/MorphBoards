import type { BoardElement } from '@morphboards/shared';
import { unionRects } from '../geometry/geo';

const W = 320;
const H = 180;

/** Paint a tiny schematic of the board (colored boxes per element type). */
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

  ctx.fillStyle = '#14161c';
  ctx.fillRect(0, 0, W, H);
  const bounds = unionRects(all);
  if (bounds && all.length > 0) {
    const pad = 14;
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
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.strokeRect(x, y, w, h);
          break;
        case 'sticky':
          ctx.fillStyle = el.color;
          ctx.fillRect(x, y, w, h);
          break;
        case 'shape':
          ctx.fillStyle = el.fill === 'transparent' ? 'rgba(139,147,167,0.35)' : el.fill;
          ctx.fillRect(x, y, w, h);
          break;
        case 'image':
          ctx.fillStyle = '#3a4152';
          ctx.fillRect(x, y, w, h);
          break;
        case 'link':
          ctx.fillStyle = '#2e4a7a';
          ctx.fillRect(x, y, w, h);
          break;
        case 'text':
          ctx.fillStyle = '#6b7385';
          ctx.fillRect(x, y + h * 0.3, w, Math.max(h * 0.4, 2));
          break;
        case 'comment':
          ctx.fillStyle = '#ffc94f';
          ctx.beginPath();
          ctx.arc(x + w / 2, y + h / 2, Math.max(w / 2, 2), 0, Math.PI * 2);
          ctx.fill();
          break;
      }
    }
  }
  return canvas.toDataURL('image/png');
}
