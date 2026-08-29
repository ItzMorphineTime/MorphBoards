import { useUiStore } from '../state/uiStore';

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Tools',
    rows: [
      ['V', 'Select'],
      ['H', 'Pan'],
      ['N', 'Sticky note'],
      ['T', 'Text'],
      ['S', 'Shape'],
      ['L', 'Line / arrow'],
      ['C', 'Connector'],
      ['F', 'Frame'],
      ['M', 'Comment'],
    ],
  },
  {
    title: 'Edit',
    rows: [
      ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
      ['Ctrl+C / X / V', 'Copy / cut / paste'],
      ['Ctrl+D', 'Duplicate'],
      ['Alt+drag', 'Duplicate by dragging'],
      ['Delete', 'Delete selection'],
      ['Arrows (+Shift)', 'Nudge 1px (10px)'],
      ['Ctrl+A', 'Select all'],
      ['Ctrl+[ / ]', 'Send backward / bring forward'],
      ['Ctrl+Shift+[ / ]', 'Send to back / bring to front'],
    ],
  },
  {
    title: 'View',
    rows: [
      ['Ctrl+wheel', 'Zoom at cursor'],
      ['Wheel / Shift+wheel', 'Pan'],
      ['Space+drag / middle-drag', 'Pan'],
      ['Ctrl+= / Ctrl+-', 'Zoom in / out'],
      ['Ctrl+0', 'Zoom to 100%'],
      ['Shift+1', 'Zoom to fit'],
      ['Shift+2', 'Zoom to selection'],
    ],
  },
  {
    title: 'Canvas',
    rows: [
      ['Double-click element', 'Edit text / title'],
      ['Shift+click', 'Add to selection'],
      ['Shift while resizing', 'Keep aspect ratio'],
      ['Shift while drawing', 'Square / 45° snap'],
      ['Hover element', 'Show connector ports'],
      ['Paste image / URL', 'Add image / link card'],
      ['Esc', 'Cancel / deselect'],
    ],
  },
];

export function ShortcutHelp() {
  const open = useUiStore((s) => s.helpOpen);
  if (!open) return null;
  const close = () => useUiStore.setState({ helpOpen: false });
  return (
    <div className="modal-backdrop" onPointerDown={close}>
      <div className="help-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="help-header">
          <span>Keyboard shortcuts</span>
          <button className="ghost-btn" onClick={close} title="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="help-grid">
          {GROUPS.map((g) => (
            <div key={g.title} className="help-group">
              <div className="help-group-title">{g.title}</div>
              {g.rows.map(([k, desc]) => (
                <div key={k} className="help-row">
                  <span className="help-desc">{desc}</span>
                  <kbd>{k}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
