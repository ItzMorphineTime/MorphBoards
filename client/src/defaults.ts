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

export const STICKY_COLORS = [
  '#fff176',
  '#ffb74d',
  '#ff8a80',
  '#f48fb1',
  '#ce93d8',
  '#90caf9',
  '#80deea',
  '#a5d6a7',
  '#e0e0e0',
];

export const ELEMENT_COLORS = [
  'transparent',
  '#2b3242',
  '#3d4a63',
  '#553d63',
  '#63443d',
  '#3d6349',
  '#8a2e3c',
  '#1f6feb',
  '#b58a2e',
  '#e8eaf0',
];

export const STROKE_COLORS = [
  '#8b93a7',
  '#e8eaf0',
  '#4f8cff',
  '#ffc94f',
  '#ff6b6b',
  '#51cf66',
  '#b197fc',
  'transparent',
];

export const TEXT_COLORS = ['#e8eaf0', '#9aa3b8', '#4f8cff', '#ffc94f', '#ff6b6b', '#51cf66', '#1e1e1e'];

export function makeShape(kind: ShapeKind, rect: Rect): ShapeElement {
  return {
    id: newId(),
    type: 'shape',
    ...rect,
    kind,
    fill: '#2b3242',
    stroke: '#8b93a7',
    strokeWidth: 2,
    opacity: 1,
    text: '',
    textStyle: { fontSize: 16, color: '#e8eaf0', align: 'center', bold: false },
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
    textStyle: { fontSize: 24, color: '#e8eaf0', align: 'left', bold: false },
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
    stroke: '#9aa3b8',
    strokeWidth: 2,
    ...opts,
  };
}
