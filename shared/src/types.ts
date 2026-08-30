/**
 * MorphBoards board schema, shared by client and server.
 *
 * Coordinate system: all element positions/sizes are in world coordinates.
 * The viewport maps world → screen as: screen = world * zoom + pan.
 */

export const SCHEMA_VERSION = 1;

export interface Viewport {
  x: number; // pan, screen px
  y: number;
  zoom: number;
}

// ---------------------------------------------------------------------------
// Elements

export type ElementType = 'shape' | 'text' | 'sticky' | 'image' | 'link' | 'frame' | 'comment';

export interface ElementBase {
  id: string;
  type: ElementType;
  /** World coordinates of the top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Frame this element belongs to (moves/scales with it). */
  frameId?: string | null;
  /** Locked elements can't be selected or moved (backdrops etc.). */
  locked?: boolean;
}

export type ShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'diamond' | 'triangle';

export type TextAlign = 'left' | 'center' | 'right';

export interface TextStyle {
  fontSize: number;
  color: string;
  align: TextAlign;
  bold: boolean;
}

export interface ShapeElement extends ElementBase {
  type: 'shape';
  kind: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  /** Optional label rendered inside the shape. */
  text: string;
  textStyle: TextStyle;
}

export interface TextElement extends ElementBase {
  type: 'text';
  text: string;
  textStyle: TextStyle;
}

export interface StickyElement extends ElementBase {
  type: 'sticky';
  /** CSS background color (from the sticky palette). */
  color: string;
  text: string;
  /** Explicit text size; null/undefined = auto-scale with the sticky's width. */
  fontSize?: number | null;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  /** Server URL, e.g. /files/<boardId>/<assetId>.png */
  assetUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  title?: string;
}

export interface LinkElement extends ElementBase {
  type: 'link';
  url: string;
  title: string;
  description?: string;
  /** Title text size; undefined = default card size. */
  fontSize?: number;
}

export interface FrameElement extends ElementBase {
  type: 'frame';
  title: string;
  fill: string;
}

export interface CommentMessage {
  id: string;
  text: string;
  createdAt: number; // epoch ms
}

export interface CommentElement extends ElementBase {
  type: 'comment';
  /** When set, the pin follows this element around. */
  attachedTo?: string | null;
  messages: CommentMessage[];
  resolved: boolean;
}

export type BoardElement =
  | ShapeElement
  | TextElement
  | StickyElement
  | ImageElement
  | LinkElement
  | FrameElement
  | CommentElement;

// ---------------------------------------------------------------------------
// Connectors (also used for standalone lines/arrows via two point attachments)

export type AttachSide = 'auto' | 'n' | 'e' | 's' | 'w';

export type Attachment =
  | { kind: 'element'; elementId: string; side: AttachSide }
  | { kind: 'point'; x: number; y: number };

export type ConnectorRouting = 'straight' | 'elbow';

export interface Connector {
  id: string;
  from: Attachment;
  to: Attachment;
  routing: ConnectorRouting;
  arrowStart: boolean;
  arrowEnd: boolean;
  label?: string;
  stroke: string;
  strokeWidth: number;
}

// ---------------------------------------------------------------------------
// Board documents

export interface BoardDoc {
  schemaVersion: number;
  elements: Record<string, BoardElement>;
  /** Render/z order of element ids, bottom → top. */
  order: string[];
  connectors: Record<string, Connector>;
  /** Last camera position, restored on open. */
  viewport?: Viewport;
}

export function emptyBoardDoc(): BoardDoc {
  return { schemaVersion: SCHEMA_VERSION, elements: {}, order: [], connectors: {} };
}

export interface BoardMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface BoardListItem extends BoardMeta {
  thumbnailUrl: string | null;
}

export interface BoardWithDoc extends BoardMeta {
  doc: BoardDoc;
}

export interface AssetUploadResult {
  assetId: string;
  url: string;
}
