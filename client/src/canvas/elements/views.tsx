import { useLayoutEffect, useRef, useState } from 'react';
import type {
  CommentElement,
  FrameElement,
  ImageElement,
  LinkElement,
  ShapeElement,
  StickyElement,
  TextElement,
} from '@morphboards/shared';
import { clamp } from '../../geometry/geo';
import { useBoardStore } from '../../state/boardStore';
import { useUiStore } from '../../state/uiStore';
import { EditableText, textCss } from './EditableText';

interface ViewProps<T> {
  el: T;
  editing: boolean;
}

function commitText(id: string, patch: Record<string, unknown>): void {
  useBoardStore.getState().updateElements({ [id]: patch });
}

// ---------------------------------------------------------------------------

export function ShapeView({ el, editing }: ViewProps<ShapeElement>) {
  const { width: w, height: h, strokeWidth } = el;
  const i = Math.min(strokeWidth / 2 + 0.5, w / 2, h / 2);
  const fill = el.fill === 'transparent' ? 'none' : el.fill;
  const stroke = el.stroke === 'transparent' ? 'none' : el.stroke;
  let shape: React.ReactNode;
  switch (el.kind) {
    case 'rect':
    case 'roundRect':
      shape = (
        <rect
          x={i}
          y={i}
          width={Math.max(w - i * 2, 1)}
          height={Math.max(h - i * 2, 1)}
          rx={el.kind === 'roundRect' ? Math.min(16, w * 0.15, h * 0.15) : 0}
        />
      );
      break;
    case 'ellipse':
      shape = <ellipse cx={w / 2} cy={h / 2} rx={Math.max(w / 2 - i, 1)} ry={Math.max(h / 2 - i, 1)} />;
      break;
    case 'diamond':
      shape = <polygon points={`${w / 2},${i} ${w - i},${h / 2} ${w / 2},${h - i} ${i},${h / 2}`} />;
      break;
    case 'triangle':
      shape = <polygon points={`${w / 2},${i} ${w - i},${h - i} ${i},${h - i}`} />;
      break;
  }
  return (
    <div className="shape-view" style={{ opacity: el.opacity }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <g fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round">
          {shape}
        </g>
      </svg>
      {(el.text !== '' || editing) && (
        <div className="shape-label">
          <EditableText
            value={el.text}
            editing={editing}
            ownerId={el.id}
            style={textCss(el.textStyle)}
            onCommit={(text) => commitText(el.id, { text })}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function TextView({ el, editing }: ViewProps<TextElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (editing) return;
    const node = ref.current;
    if (!node) return;
    const h = Math.max(node.scrollHeight, el.textStyle.fontSize * 1.3 + 8);
    if (Math.abs(h - el.height) > 2) {
      useBoardStore.getState().silentUpdate({ [el.id]: { height: h } });
    }
  }, [el.id, el.text, el.width, el.height, el.textStyle.fontSize, el.textStyle.bold, editing]);

  return (
    <div className="text-view" ref={ref}>
      <EditableText
        value={el.text}
        editing={editing}
        ownerId={el.id}
        style={textCss(el.textStyle)}
        placeholder="Type something"
        onCommit={(text) => commitText(el.id, { text })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function StickyView({ el, editing }: ViewProps<StickyElement>) {
  const fontSize = el.fontSize ?? clamp((el.width / 180) * 20, 6, 120);
  return (
    <div className="sticky-view" style={{ background: el.color }}>
      <EditableText
        value={el.text}
        editing={editing}
        ownerId={el.id}
        style={{ fontSize, color: '#1f2329', textAlign: 'center', fontWeight: 500, lineHeight: 1.35 }}
        onCommit={(text) => commitText(el.id, { text })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ImageView({ el }: ViewProps<ImageElement>) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="image-broken" title={el.assetUrl}>
        <span>image missing</span>
      </div>
    );
  }
  return (
    <img
      className="image-view"
      src={el.assetUrl}
      alt={el.title ?? ''}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

// ---------------------------------------------------------------------------

export function LinkView({ el, editing }: ViewProps<LinkElement>) {
  let hostname = el.url;
  try {
    hostname = new URL(el.url).hostname.replace(/^www\./, '');
  } catch {
    // show raw url
  }
  const titleSize = el.fontSize ?? 13.5;
  return (
    <div className="link-card">
      <div className="link-avatar">{(el.title || hostname).charAt(0).toUpperCase()}</div>
      <div className="link-body">
        <EditableText
          value={el.title}
          editing={editing}
          ownerId={el.id}
          className="link-title"
          style={{ fontSize: titleSize }}
          onCommit={(title) => commitText(el.id, { title })}
        />
        <div className="link-url" style={{ fontSize: Math.max(10, Math.round(titleSize * 0.88)) }}>
          {hostname}
        </div>
      </div>
      <a
        className="link-open"
        href={el.url}
        target="_blank"
        rel="noreferrer noopener"
        title={`Open ${el.url}`}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function FrameView({ el, editing }: ViewProps<FrameElement>) {
  return (
    <>
      <div className="frame-title">
        <EditableText
          value={el.title}
          editing={editing}
          ownerId={el.id}
          selectAllOnFocus
          onCommit={(title) => commitText(el.id, { title: title.trim() || el.title })}
        />
      </div>
      <div className="frame-body" style={{ background: el.fill }} />
    </>
  );
}

// ---------------------------------------------------------------------------

export function CommentPinView({ el }: ViewProps<CommentElement>) {
  const open = useUiStore((s) => s.openCommentId === el.id);
  const count = el.messages.length;
  return (
    <div className={`comment-pin ${el.resolved ? 'resolved' : ''} ${open ? 'open' : ''}`}>
      {el.resolved ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M4 12.5 9.5 18 20 6.5" />
        </svg>
      ) : (
        <span>{count > 0 ? count : '+'}</span>
      )}
    </div>
  );
}
