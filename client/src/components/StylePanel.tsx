import type { BoardElement, Connector, TextStyle } from '@morphboards/shared';
import {
  ELEMENT_COLORS,
  STICKY_COLORS,
  STROKE_COLORS,
  TEXT_COLORS,
} from '../defaults';
import { deleteSelection, toggleLockSelection } from '../interactions/actions';
import { useBoardStore, type ElementPatch } from '../state/boardStore';
import { useUiStore } from '../state/uiStore';
import { Icons } from './icons';

function Swatches({
  colors,
  onPick,
  active,
}: {
  colors: string[];
  onPick(color: string): void;
  active?: string;
}) {
  return (
    <div className="swatch-row">
      {colors.map((c) => (
        <button
          key={c}
          className={`swatch ${c === 'transparent' ? 'transparent' : ''} ${active === c ? 'active' : ''}`}
          style={c === 'transparent' ? undefined : { background: c }}
          title={c}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="panel-section">
      <div className="panel-label">{label}</div>
      {children}
    </div>
  );
}

export function StylePanel() {
  const selection = useUiStore((s) => s.selection);
  const selectedConnectors = useUiStore((s) => s.selectedConnectors);
  const elements = useBoardStore((s) => s.elements);
  const connectors = useBoardStore((s) => s.connectors);

  const els = selection
    .map((id) => elements[id])
    .filter((el): el is BoardElement => Boolean(el));
  const cons = selectedConnectors
    .map((id) => connectors[id])
    .filter((c): c is Connector => Boolean(c));
  if (els.length === 0 && cons.length === 0) return null;

  const patchEls = (
    filter: (el: BoardElement) => boolean,
    patchFor: (el: BoardElement) => ElementPatch,
  ) => {
    const patches: Record<string, ElementPatch> = {};
    for (const el of els) if (filter(el)) patches[el.id] = patchFor(el);
    if (Object.keys(patches).length > 0) useBoardStore.getState().updateElements(patches);
  };

  const patchTextStyle = (change: Partial<TextStyle>) =>
    patchEls(
      (el) => el.type === 'text' || el.type === 'shape',
      (el) => ({
        textStyle: { ...(el as { textStyle: TextStyle }).textStyle, ...change },
      }),
    );

  const patchCons = (patch: Partial<Connector>) => {
    const patches: Record<string, Partial<Connector>> = {};
    for (const c of cons) patches[c.id] = patch;
    if (Object.keys(patches).length > 0) useBoardStore.getState().updateConnectors(patches);
  };

  const stickies = els.filter((el) => el.type === 'sticky');
  const fillables = els.filter((el) => el.type === 'shape' || el.type === 'frame');
  const shapes = els.filter((el) => el.type === 'shape');
  const textEls = els.filter((el) => el.type === 'text' || el.type === 'shape');
  const link = els.length === 1 && els[0].type === 'link' ? els[0] : null;
  const firstText = textEls[0] as { textStyle: TextStyle } | undefined;
  const anyLocked = els.some((el) => el.locked);

  return (
    <div className="style-panel" onPointerDown={(e) => e.stopPropagation()}>
      {stickies.length > 0 && (
        <Section label="Sticky color">
          <Swatches
            colors={STICKY_COLORS}
            active={stickies[0].type === 'sticky' ? stickies[0].color : undefined}
            onPick={(color) => patchEls((el) => el.type === 'sticky', () => ({ color }))}
          />
        </Section>
      )}

      {fillables.length > 0 && (
        <Section label="Fill">
          <Swatches
            colors={ELEMENT_COLORS}
            onPick={(fill) =>
              patchEls(
                (el) => el.type === 'shape' || el.type === 'frame',
                (el) => (el.type === 'frame' ? { fill: fill === 'transparent' ? 'rgba(255,255,255,0.04)' : fill } : { fill }),
              )
            }
          />
        </Section>
      )}

      {shapes.length > 0 && (
        <>
          <Section label="Stroke">
            <Swatches
              colors={STROKE_COLORS}
              onPick={(stroke) => patchEls((el) => el.type === 'shape', () => ({ stroke }))}
            />
            <div className="btn-row">
              {[1, 2, 4, 8].map((w) => (
                <button
                  key={w}
                  className="mini-btn"
                  title={`Stroke width ${w}`}
                  onClick={() => patchEls((el) => el.type === 'shape', () => ({ strokeWidth: w }))}
                >
                  <div style={{ width: 16, height: w, background: 'currentColor', borderRadius: 2 }} />
                </button>
              ))}
            </div>
          </Section>
          <Section label="Opacity">
            <input
              type="range"
              min={10}
              max={100}
              defaultValue={Math.round((shapes[0].type === 'shape' ? shapes[0].opacity : 1) * 100)}
              onChange={(e) =>
                patchEls(
                  (el) => el.type === 'shape',
                  () => ({ opacity: Number(e.target.value) / 100 }),
                )
              }
            />
          </Section>
        </>
      )}

      {textEls.length > 0 && firstText && (
        <Section label="Text">
          <div className="btn-row">
            <button
              className="mini-btn"
              title="Smaller"
              onClick={() =>
                patchEls(
                  (el) => el.type === 'text' || el.type === 'shape',
                  (el) => {
                    const ts = (el as { textStyle: TextStyle }).textStyle;
                    return { textStyle: { ...ts, fontSize: Math.max(6, Math.round(ts.fontSize / 1.2)) } };
                  },
                )
              }
            >
              A−
            </button>
            <span className="mini-value">{Math.round(firstText.textStyle.fontSize)}</span>
            <button
              className="mini-btn"
              title="Larger"
              onClick={() =>
                patchEls(
                  (el) => el.type === 'text' || el.type === 'shape',
                  (el) => {
                    const ts = (el as { textStyle: TextStyle }).textStyle;
                    return { textStyle: { ...ts, fontSize: Math.min(400, Math.round(ts.fontSize * 1.2)) } };
                  },
                )
              }
            >
              A+
            </button>
            <button
              className={`mini-btn ${firstText.textStyle.bold ? 'active' : ''}`}
              title="Bold"
              style={{ fontWeight: 700 }}
              onClick={() => patchTextStyle({ bold: !firstText.textStyle.bold })}
            >
              B
            </button>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                className={`mini-btn ${firstText.textStyle.align === a ? 'active' : ''}`}
                title={`Align ${a}`}
                onClick={() => patchTextStyle({ align: a })}
              >
                <AlignIcon align={a} />
              </button>
            ))}
          </div>
          <Swatches
            colors={TEXT_COLORS}
            active={firstText.textStyle.color}
            onPick={(color) => patchTextStyle({ color })}
          />
        </Section>
      )}

      {link && (
        <Section label="Link URL">
          <input
            className="panel-input"
            defaultValue={link.url}
            spellCheck={false}
            onBlur={(e) => {
              const url = e.target.value.trim();
              if (url && url !== link.url) {
                useBoardStore.getState().updateElements({ [link.id]: { url } });
              }
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </Section>
      )}

      {cons.length > 0 && (
        <Section label={cons[0].arrowEnd || cons[0].arrowStart ? 'Connector' : 'Line'}>
          <div className="btn-row">
            <button
              className={`mini-btn ${cons[0].routing === 'straight' ? 'active' : ''}`}
              title="Straight"
              onClick={() => patchCons({ routing: 'straight' })}
            >
              {Icons.line({ size: 15 })}
            </button>
            <button
              className={`mini-btn ${cons[0].routing === 'elbow' ? 'active' : ''}`}
              title="Elbow"
              onClick={() => patchCons({ routing: 'elbow' })}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 19V9h16V5" />
              </svg>
            </button>
            <button
              className={`mini-btn ${cons[0].arrowStart ? 'active' : ''}`}
              title="Arrow at start"
              onClick={() => patchCons({ arrowStart: !cons[0].arrowStart })}
            >
              ←
            </button>
            <button
              className={`mini-btn ${cons[0].arrowEnd ? 'active' : ''}`}
              title="Arrow at end"
              onClick={() => patchCons({ arrowEnd: !cons[0].arrowEnd })}
            >
              →
            </button>
            {[1, 2, 4].map((w) => (
              <button
                key={w}
                className={`mini-btn ${cons[0].strokeWidth === w ? 'active' : ''}`}
                title={`Width ${w}`}
                onClick={() => patchCons({ strokeWidth: w })}
              >
                <div style={{ width: 14, height: w, background: 'currentColor', borderRadius: 2 }} />
              </button>
            ))}
          </div>
          <Swatches
            colors={STROKE_COLORS.filter((c) => c !== 'transparent')}
            active={cons[0].stroke}
            onPick={(stroke) => patchCons({ stroke })}
          />
        </Section>
      )}

      {els.length > 0 && (
        <div className="panel-footer">
          <button className="mini-btn" title={anyLocked ? 'Unlock' : 'Lock'} onClick={toggleLockSelection}>
            {Icons.lock({ size: 15 })}
          </button>
          <button className="mini-btn danger" title="Delete (Del)" onClick={deleteSelection}>
            {Icons.trash({ size: 15 })}
          </button>
        </div>
      )}
      {els.length === 0 && cons.length > 0 && (
        <div className="panel-footer">
          <button className="mini-btn danger" title="Delete (Del)" onClick={deleteSelection}>
            {Icons.trash({ size: 15 })}
          </button>
        </div>
      )}
    </div>
  );
}

function AlignIcon({ align }: { align: 'left' | 'center' | 'right' }) {
  const x2 = align === 'left' ? 14 : align === 'center' ? 19 : 24;
  const x1 = align === 'left' ? 4 : align === 'center' ? 9 : 14;
  return (
    <svg width="15" height="15" viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d={`M4 6h20M${x1} 12h${x2 - x1 + (align === 'center' ? 0 : 0)}M4 18h20`} />
    </svg>
  );
}
