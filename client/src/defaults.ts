import {
  type Attachment,
  type CommentElement,
  type Connector,
  type FrameElement,
  type ImageElement,
  type LinkElement,
  newId,
  type ShapeElement,
  type ShapeKind,
  type StickyElement,
  type TextElement,
} from '@morphboards/shared';
import type { Point, Rect } from './geometry/geo';

export const MIN_SIZE = 8;
export const STICKY_SIZE = 180;
export const DEFAULT_SHAPE = { width: 160, height: 100 };
export const DEFAULT_FRAME = { width: 960, height: 540 }; // 16:9 shot frame
export const TEXT_WIDTH = 280;
export const COMMENT_PIN_SIZE = 32;
export const LINK_CARD = { width: 300, height: 76 };

// Presets lead with the Morph brand colours (Morph Black #0a0a0a, Signal Red
// #c51622, Studio White #ffffff, Pivot Gold #f2b705, Muted #6c6c6c, Border
// #d4d4d4), then add tints for categorising content on a Morph Black canvas.

/** Sticky text is always Morph Black, so every sticky colour stays light. */
export const STICKY_COLORS = [
  '#ffffff',
  '#f2b705',
  '#ffe8a3',
  '#f6b3b6',
  '#ffd1a6',
  '#bfe3c9',
  '#b9d8f7',
  '#dccdf5',
  '#d4d4d4',
];

export const ELEMENT_COLORS = [
  'transparent',
  '#0a0a0a',
  '#1c1c1c',
  '#2e2e2e',
  '#6c6c6c',
  '#d4d4d4',
  '#ffffff',
  '#c51622',
  '#f2b705',
  '#5c0b10',
  '#5a4402',
];

export const STROKE_COLORS = [
  '#6c6c6c',
  '#a3a3a3',
  '#ffffff',
  '#c51622',
  '#f2b705',
  '#d4d4d4',
  '#0a0a0a',
  'transparent',
];

export const TEXT_COLORS = ['#ffffff', '#a3a3a3', '#6c6c6c', '#0a0a0a', '#c51622', '#ff5c63', '#f2b705'];

export function makeShape(kind: ShapeKind, rect: Rect): ShapeElement {
  return {
    id: newId(),
    type: 'shape',
    ...rect,
    kind,
    fill: '#1c1c1c',
    stroke: '#6c6c6c',
    strokeWidth: 2,
    opacity: 1,
    text: '',
    textStyle: { fontSize: 16, color: '#ffffff', align: 'center', bold: false },
  };
}

export function makeText(p: Point): TextElement {
  return {
    id: newId(),
    type: 'text',
    x: p.x,
    y: p.y,
    width: TEXT_WIDTH,
    height: 40,
    text: '',
    textStyle: { fontSize: 24, color: '#ffffff', align: 'left', bold: false },
  };
}

export function makeSticky(p: Point, color = STICKY_COLORS[0]): StickyElement {
  return {
    id: newId(),
    type: 'sticky',
    x: p.x - STICKY_SIZE / 2,
    y: p.y - STICKY_SIZE / 2,
    width: STICKY_SIZE,
    height: STICKY_SIZE,
    color,
    text: '',
  };
}

export function makeFrame(rect: Rect, index: number): FrameElement {
  return {
    id: newId(),
    type: 'frame',
    ...rect,
    title: `Frame ${index}`,
    fill: 'rgba(255,255,255,0.04)',
  };
}

export function makeImage(rect: Rect, assetUrl: string, naturalWidth: number, naturalHeight: number): ImageElement {
  return {
    id: newId(),
    type: 'image',
    ...rect,
    assetUrl,
    naturalWidth,
    naturalHeight,
  };
}

export function makeLink(p: Point, url: string): LinkElement {
  let title = url;
  try {
    title = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    // keep raw url as title
  }
  return {
    id: newId(),
    type: 'link',
    x: p.x,
    y: p.y,
    width: LINK_CARD.width,
    height: LINK_CARD.height,
    url,
    title,
  };
}

export function makeComment(p: Point, attachedTo: string | null): CommentElement {
  return {
    id: newId(),
    type: 'comment',
    x: p.x - COMMENT_PIN_SIZE / 2,
    y: p.y - COMMENT_PIN_SIZE / 2,
    width: COMMENT_PIN_SIZE,
    height: COMMENT_PIN_SIZE,
    attachedTo,
    messages: [],
    resolved: false,
  };
}

export function makeConnector(from: Attachment, to: Attachment, opts?: Partial<Connector>): Connector {
  return {
    id: newId(),
    from,
    to,
    routing: 'straight',
    arrowStart: false,
    arrowEnd: true,
    stroke: '#a3a3a3',
    strokeWidth: 2,
    ...opts,
  };
}
