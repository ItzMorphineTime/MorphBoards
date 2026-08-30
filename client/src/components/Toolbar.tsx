import { useRef, useState } from 'react';
import type { ShapeKind } from '@morphboards/shared';
import { uploadImageFiles } from '../interactions/images';
import { useCanComment, useCanEdit } from '../state/sessionStore';
import { screenToWorldPt, useViewportStore } from '../state/viewportStore';
import { useUiStore, type Tool } from '../state/uiStore';
import { Icons } from './icons';

const SHAPE_ICONS: Record<ShapeKind, (p: { size?: number }) => React.ReactNode> = {
  rect: Icons.rect,
  roundRect: Icons.roundRect,
  ellipse: Icons.ellipse,
  diamond: Icons.diamond,
  triangle: Icons.triangle,
};

const SHAPE_KINDS: ShapeKind[] = ['rect', 'roundRect', 'ellipse', 'diamond', 'triangle'];

interface ToolDef {
  tool: Tool;
  label: string;
  keyHint: string;
  icon: (p: { size?: number }) => React.ReactNode;
}

const TOOLS: ToolDef[] = [
  { tool: 'select', label: 'Select', keyHint: 'V', icon: Icons.cursor },
  { tool: 'pan', label: 'Pan', keyHint: 'H', icon: Icons.hand },
  { tool: 'sticky', label: 'Sticky note', keyHint: 'N', icon: Icons.sticky },
  { tool: 'text', label: 'Text', keyHint: 'T', icon: Icons.text },
];

const TOOLS_AFTER_SHAPE: ToolDef[] = [
  { tool: 'line', label: 'Line / arrow', keyHint: 'L', icon: Icons.line },
  { tool: 'connector', label: 'Connector', keyHint: 'C', icon: Icons.connector },
  { tool: 'frame', label: 'Frame', keyHint: 'F', icon: Icons.frame },
  { tool: 'comment', label: 'Comment', keyHint: 'M', icon: Icons.comment },
];

export function Toolbar() {
  const tool = useUiStore((s) => s.tool);
  const shapeKind = useUiStore((s) => s.shapeKind);
  const setTool = useUiStore((s) => s.setTool);
  const setShapeKind = useUiStore((s) => s.setShapeKind);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = useCanEdit();
  const commentable = useCanComment();

  const toolButton = (def: ToolDef) => (
    <button
      key={def.tool}
      className={`tool-btn ${tool === def.tool ? 'active' : ''}`}
      title={`${def.label} (${def.keyHint})`}
      onClick={() => {
        setTool(def.tool);
        setShapeMenuOpen(false);
      }}
    >
      {def.icon({ size: 19 })}
    </button>
  );

  if (!editable) {
    // viewers get navigation only; commenters also get the comment tool
    const guestTools = TOOLS.filter((t) => t.tool === 'select' || t.tool === 'pan');
    if (commentable) guestTools.push(TOOLS_AFTER_SHAPE.find((t) => t.tool === 'comment')!);
    return <div className="toolbar">{guestTools.map(toolButton)}</div>;
  }

  return (
    <div className="toolbar">
      {TOOLS.map(toolButton)}

      <div className="tool-btn-wrap">
        <button
          className={`tool-btn ${tool === 'shape' ? 'active' : ''}`}
          title="Shape (S) — click again for more shapes"
          onClick={() => {
            if (tool === 'shape') setShapeMenuOpen((v) => !v);
            else {
              setTool('shape');
              setShapeMenuOpen(false);
            }
          }}
        >
          {SHAPE_ICONS[shapeKind]({ size: 19 })}
          <span className="tool-corner" />
        </button>
        {shapeMenuOpen && (
          <div className="shape-menu" onPointerDown={(e) => e.stopPropagation()}>
            {SHAPE_KINDS.map((kind) => (
              <button
                key={kind}
                className={`tool-btn ${shapeKind === kind ? 'active' : ''}`}
                title={kind}
                onClick={() => {
                  setShapeKind(kind);
                  setShapeMenuOpen(false);
                }}
              >
                {SHAPE_ICONS[kind]({ size: 19 })}
              </button>
            ))}
          </div>
        )}
      </div>

      {TOOLS_AFTER_SHAPE.map(toolButton)}

      <div className="toolbar-divider" />

      <button
        className="tool-btn"
        title="Upload images"
        onClick={() => fileRef.current?.click()}
      >
        {Icons.image({ size: 19 })}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length === 0) return;
          const { size } = useViewportStore.getState();
          const center = screenToWorldPt({ x: size.width / 2, y: size.height / 2 });
          void uploadImageFiles(files, center);
        }}
      />
    </div>
  );
}
