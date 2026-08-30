import type { BoardElement, Connector, TextStyle } from '@morphboards/shared';
import {
  ELEMENT_COLORS,
  STICKY_COLORS,
  STROKE_COLORS,
  TEXT_COLORS,
} from '../defaults';
import { clamp } from '../geometry/geo';
import { deleteSelection, toggleLockSelection } from '../interactions/actions';
import { useBoardStore, type ElementPatch } from '../state/boardStore';
import { useUiStore } from '../state/uiStore';
import { ColorField } from './ColorField';
import { Icons } from './icons';

const FILL_PRESETS = ELEMENT_COLORS.filter((c) => c !== 'transparent');
const STROKE_PRESETS = STROKE_COLORS.filter((c) => c !== 'transparent');

/** Current text size of any text-bearing element (auto sizes resolved). */
function effectiveFontSize(el: BoardElement): number {
  switch (el.type) {
    case 'text':
    case 'shape':
      return el.textStyle.fontSize;
    case 'sticky':
      return el.fontSize ?? clamp((el.width / 180) * 20, 6, 120);
    case 'link':
      return el.fontSize ?? 13.5;
    default:
      return 0;
  }
}

function isSizable(el: BoardElement): boolean {
  return el.type === 'text' || el.type === 'shape' || el.type === 'sticky' || el.type === 'link';
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="panel-section">
      <div className="panel-label">{label}</div>
      {children}
    </div>
  );
}

/**
 * Preview-capable color application: start opens one transient session over
 * the targets, apply patches it live (native picker drags), end commits it
 * as a single undo step.
 */
function colorHandlers(
  elementIds: string[],
  patchFor: (color: string, el: BoardElement) => ElementPatch,
  connectorIds: string[] = [],
  conPatchFor?: (color: string) => Partial<Connector>,
) {
  const store = () => useBoardStore.getState();
  return {
    onStart: () => store().beginTransient(elementIds, connectorIds),
    onApply: (color: string) => {
      const s = store();
      const elPatches: Record<string, ElementPatch> = {};
      for (const id of elementIds) {
        const el = s.elements[id];
        if (el) elPatches[id] = patchFor(color, el);
      }
      const conPatches: Record<string, Partial<Connector>> = {};
      if (conPatchFor) for (const id of connectorIds) conPatches[id] = conPatchFor(color);
      s.applyTransient(elPatches, conPatches);
    },
    onEnd: () => store().endTransient(),
  };
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
  const conIds = cons.map((c) => c.id);

  const sizables = els.filter(isSizable);
  const allStickiesAuto = stickies.every((el) => el.type === 'sticky' && el.fontSize == null);
  const scaleFonts = (factor: number) => {
    const patches: Record<string, ElementPatch> = {};
    for (const el of sizables) {
      const next = clamp(Math.round(effectiveFontSize(el) * factor), 6, 400);
      if (el.type === 'text' || el.type === 'shape') {
        patches[el.id] = { textStyle: { ...el.textStyle, fontSize: next } };
      } else {
        patches[el.id] = { fontSize: next };
      }
    }
    if (Object.keys(patches).length > 0) useBoardStore.getState().updateElements(patches);
  };

  const single = els.length === 1 && cons.length === 0 ? els[0] : null;
  const sizeTarget = single && single.type !== 'comment' && !single.locked ? single : null;
  const commitDimension = (dim: 'width' | 'height', raw: string) => {
    if (!sizeTarget) return;
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const next = clamp(Math.round(v), 8, 100000);
    if (Math.round(sizeTarget[dim]) === next) return;
    useBoardStore.getState().updateElements({ [sizeTarget.id]: { [dim]: next } });
  };

  return (
    <div className="style-panel" onPointerDown={(e) => e.stopPropagation()}>
      {sizeTarget && (
        <Section label="Size">
          <div className="btn-row">
            <label className="size-field">
              W
              <input
                key={`${sizeTarget.id}:w:${Math.round(sizeTarget.width)}`}
                className="size-input"
                type="number"
                min={8}
                defaultValue={Math.round(sizeTarget.width)}
                onBlur={(e) => commitDimension('width', e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            </label>
            {sizeTarget.type !== 'text' && (
              <label className="size-field">
                H
                <input
                  key={`${sizeTarget.id}:h:${Math.round(sizeTarget.height)}`}
                  className="size-input"
                  type="number"
                  min={8}
                  defaultValue={Math.round(sizeTarget.height)}
                  onBlur={(e) => commitDimension('height', e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                />
              </label>
            )}
          </div>
        </Section>
      )}
      {stickies.length > 0 && (
        <Section label="Sticky color">
          <ColorField
            presets={STICKY_COLORS}
            value={stickies[0].type === 'sticky' ? stickies[0].color : undefined}
            {...colorHandlers(
              stickies.map((el) => el.id),
              (color) => ({ color }),
            )}
          />
        </Section>
      )}

      {fillables.length > 0 && (
        <Section label="Fill">
          <ColorField
            presets={FILL_PRESETS}
            allowTransparent
            value={'fill' in fillables[0] ? (fillables[0] as { fill: string }).fill : undefined}
            {...colorHandlers(
              fillables.map((el) => el.id),
              (color, el) =>
                el.type === 'frame'
                  ? { fill: color === 'transparent' ? 'rgba(255,255,255,0.04)' : color }
                  : { fill: color },
            )}
          />
        </Section>
      )}

      {shapes.length > 0 && (
        <>
          <Section label="Stroke">
            <ColorField
              presets={STROKE_PRESETS}
              allowTransparent
              value={shapes[0].type === 'shape' ? shapes[0].stroke : undefined}
              {...colorHandlers(
                shapes.map((el) => el.id),
                (stroke) => ({ stroke }),
              )}
            />
            <div className="btn-row">
              {[1, 2, 4, 8].map((w) => (
                <button
                  key={w}
                  className={`mini-btn ${shapes[0].type === 'shape' && shapes[0].strokeWidth === w ? 'active' : ''}`}
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

      {sizables.length > 0 && (
        <Section label="Text">
          <div className="btn-row">
            <button className="mini-btn" title="Smaller text" onClick={() => scaleFonts(1 / 1.2)}>
              A−
            </button>
            <span className="mini-value">{Math.round(effectiveFontSize(sizables[0]))}</span>
            <button className="mini-btn" title="Larger text" onClick={() => scaleFonts(1.2)}>
              A+
            </button>
            {stickies.length > 0 && (
              <button
                className={`mini-btn ${allStickiesAuto ? 'active' : ''}`}
                title="Auto-size text with the sticky's width"
                onClick={() =>
                  patchEls(
                    (el) => el.type === 'sticky',
                    () => ({ fontSize: null }),
                  )
                }
              >
                Auto
              </button>
            )}
            {firstText && (
              <>
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
              </>
            )}
          </div>
          {firstText && (
            <ColorField
              presets={TEXT_COLORS}
              value={firstText.textStyle.color}
              {...colorHandlers(
                textEls.map((el) => el.id),
                (color, el) => ({
                  textStyle: { ...(el as { textStyle: TextStyle }).textStyle, color },
                }),
              )}
            />
          )}
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
          <ColorField
            presets={STROKE_PRESETS}
            value={cons[0].stroke}
            {...colorHandlers([], () => ({}), conIds, (stroke) => ({ stroke }))}
          />
        </Section>
      )}

      <div className="panel-footer">
        {els.length > 0 && (
          <button className="mini-btn" title={anyLocked ? 'Unlock' : 'Lock'} onClick={toggleLockSelection}>
            {Icons.lock({ size: 15 })}
          </button>
        )}
        <button className="mini-btn danger" title="Delete (Del)" onClick={deleteSelection}>
          {Icons.trash({ size: 15 })}
        </button>
      </div>
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
