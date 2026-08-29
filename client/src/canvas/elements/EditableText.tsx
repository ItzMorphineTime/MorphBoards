import { type CSSProperties, useEffect, useRef, useState } from 'react';
import type { TextStyle } from '@morphboards/shared';
import { useUiStore } from '../../state/uiStore';

export function textCss(ts: TextStyle): CSSProperties {
  return {
    fontSize: ts.fontSize,
    color: ts.color,
    textAlign: ts.align,
    fontWeight: ts.bold ? 600 : 400,
    lineHeight: 1.3,
  };
}

interface Props {
  value: string;
  editing: boolean;
  onCommit(next: string): void;
  style?: CSSProperties;
  className?: string;
  placeholder?: string;
  selectAllOnFocus?: boolean;
}

/** Displays text; swaps to an auto-growing textarea while editing. */
export function EditableText({
  value,
  editing,
  onCommit,
  style,
  className,
  placeholder,
  selectAllOnFocus = true,
}: Props) {
  if (!editing) {
    return (
      <div className={`etext-display ${className ?? ''}`} style={style}>
        {value !== '' ? value : <span className="etext-placeholder">{placeholder ?? ''}</span>}
      </div>
    );
  }
  return (
    <TextEditor
      value={value}
      onCommit={onCommit}
      style={style}
      className={className}
      selectAllOnFocus={selectAllOnFocus}
    />
  );
}

function TextEditor({
  value,
  onCommit,
  style,
  className,
  selectAllOnFocus,
}: Omit<Props, 'editing' | 'placeholder'>) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    autoGrow(node);
    // Defer focus past the click that started the edit: the browser's default
    // mousedown action fires right after pointerdown and would move focus to
    // the body, blurring (and committing) the editor immediately.
    const t = window.setTimeout(() => {
      node.focus();
      if (selectAllOnFocus) node.select();
      else node.setSelectionRange(node.value.length, node.value.length);
    }, 0);
    return () => window.clearTimeout(t);
  }, [selectAllOnFocus]);

  const commit = (next: string) => {
    if (committed.current) return;
    committed.current = true;
    onCommit(next);
    const u = useUiStore.getState();
    if (u.editingId !== null) u.setEditing(null);
  };

  return (
    <textarea
      ref={ref}
      className={`etext-editor ${className ?? ''}`}
      style={style}
      value={text}
      rows={1}
      spellCheck={false}
      onChange={(e) => {
        setText(e.target.value);
        autoGrow(e.target);
      }}
      onBlur={() => commit(text)}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          commit(text);
        }
      }}
    />
  );
}

function autoGrow(node: HTMLTextAreaElement): void {
  node.style.height = 'auto';
  node.style.height = `${node.scrollHeight}px`;
}
