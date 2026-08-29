import { useMemo } from 'react';
import { useBoardStore } from '../state/boardStore';
import { useUiStore } from '../state/uiStore';
import { ElementView } from './elements/ElementView';

export function WorldLayer() {
  const order = useBoardStore((s) => s.order);
  const interactive = useUiStore((s) => s.tool === 'select');

  // element types never change, so the frame/non-frame split only depends on `order`
  const { frames, rest } = useMemo(() => {
    const els = useBoardStore.getState().elements;
    const frameIds: string[] = [];
    const restIds: string[] = [];
    for (const id of order) {
      (els[id]?.type === 'frame' ? frameIds : restIds).push(id);
    }
    return { frames: frameIds, rest: restIds };
  }, [order]);

  return (
    <div className="world-elements" style={{ pointerEvents: interactive ? undefined : 'none' }}>
      {frames.map((id) => (
        <ElementView key={id} id={id} />
      ))}
      {rest.map((id) => (
        <ElementView key={id} id={id} />
      ))}
    </div>
  );
}
