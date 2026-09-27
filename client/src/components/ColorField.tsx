import { useEffect, useRef, useState } from 'react';
import { useRecentColors } from '../state/recentColors';

interface ColorFieldProps {
  presets: string[];
  /** Current color of the first applicable target (drives the active ring). */
  value?: string;
  allowTransparent?: boolean;
  /** Open a preview session over the applicable targets (one undo step). */
  onStart(): void;
  /** Apply a color inside the session (live preview while picking). */
  onApply(color: string): void;
  /** Commit the session. */
  onEnd(): void;
}

function normalize(c: string | undefined): string {
  return (c ?? '').trim().toLowerCase();
}

function asHex(c: string | undefined): string | null {
  if (!c) return null;
  const v = c.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return null;
}

/**
 * Swatch row with preset colors, optional transparent, recently used custom
 * colors, and a native color picker that previews live on the canvas.
 */
export function ColorField({
  presets,
  value,
  allowTransparent,
  onStart,
  onApply,
  onEnd,
}: ColorFieldProps) {
  const recents = useRecentColors((s) => s.colors);
  const addRecent = useRecentColors((s) => s.add);
  const inSession = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [liveValue, setLiveValue] = useState<string | null>(null);
  const current = normalize(value);

  // The native change listener below is bound once; route through a ref so it
  // always sees the handlers (and target ids) of the latest render.
  const handlers = useRef({ onStart, onApply, onEnd });
  handlers.current = { onStart, onApply, onEnd };

  // React's synthetic onChange fires on every input event, so the "picker was
  // dismissed" signal has to come from the NATIVE change event.
  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    const onNativeChange = () => {
      if (inSession.current) {
        inSession.current = false;
        handlers.current.onApply(node.value);
        handlers.current.onEnd();
        addRecent(node.value);
      }
      setLiveValue(null);
    };
    node.addEventListener('change', onNativeChange);
    return () => node.removeEventListener('change', onNativeChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // if the field unmounts mid-pick (selection changed), close the session
  useEffect(
    () => () => {
      if (inSession.current) {
        inSession.current = false;
        handlers.current.onEnd();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const pick = (color: string) => {
    onStart();
    onApply(color);
    onEnd();
  };

  const shownRecents = recents.filter((c) => !presets.includes(c));

  const swatch = (color: string) => (
    <button
      key={color}
      className={`swatch ${current === normalize(color) ? 'active' : ''}`}
      style={{ background: color }}
      title={color}
      onClick={() => pick(color)}
    />
  );

  return (
    <div className="swatch-row">
      {allowTransparent && (
        <button
          className={`swatch transparent ${current === 'transparent' ? 'active' : ''}`}
          title="No color"
          onClick={() => pick('transparent')}
        />
      )}
      {presets.map(swatch)}
      {shownRecents.map(swatch)}
      <label className="swatch custom" title="Custom color…">
        <input
          ref={inputRef}
          type="color"
          value={liveValue ?? asHex(value) ?? '#c51622'}
          onChange={(e) => {
            // synthetic change ≙ native input: live preview while picking
            const color = e.target.value;
            if (!inSession.current) {
              inSession.current = true;
              onStart();
            }
            setLiveValue(color);
            onApply(color);
          }}
          onBlur={() => {
            if (inSession.current) {
              inSession.current = false;
              onEnd();
            }
            setLiveValue(null);
          }}
        />
      </label>
    </div>
  );
}
