export type HoverTarget = Readonly<{
  seriesIndex: number;
  dataIndex: number;
}>;

export type HoverChangeCallback = (hovered: HoverTarget | null) => void;

export interface HoverState {
  setHovered(seriesIndex: number, dataIndex: number): void;
  clearHovered(): void;
  getHovered(): HoverTarget | null;
  onChange(callback: HoverChangeCallback): () => void;
  destroy?: () => void;
}

const DEFAULT_DEBOUNCE_MS = 16;

const isValidIndex = (v: number): boolean => Number.isFinite(v) && Number.isInteger(v) && v >= 0;

const copyHoverTarget = (t: HoverTarget): HoverTarget => ({
  seriesIndex: t.seriesIndex,
  dataIndex: t.dataIndex,
});

const copyHoverTargetOrNull = (t: HoverTarget | null): HoverTarget | null => (t === null ? null : copyHoverTarget(t));

const isEqualHoverTarget = (a: HoverTarget | null, b: HoverTarget | null): boolean => {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.seriesIndex === b.seriesIndex && a.dataIndex === b.dataIndex;
};

/**
 * Tracks hovered series/data indices and notifies listeners on changes.
 *
 * - Updates are debounced to avoid spamming downstream work during rapid pointer movement.
 * - Listeners fire only when the hovered target actually changes.
 */
export function createHoverState(): HoverState {
  let hovered: HoverTarget | null = null;
  let lastEmitted: HoverTarget | null = null;
  const listeners = new Set<HoverChangeCallback>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    debounceTimer = null;
    if (isEqualHoverTarget(hovered, lastEmitted)) return;
    const emitted = copyHoverTargetOrNull(hovered);
    lastEmitted = emitted;

    // Emit to a snapshot so additions/removals during emit don't affect this flush.
    const snapshot = Array.from(listeners);
    for (const cb of snapshot) cb(emitted === null ? null : copyHoverTarget(emitted));
  };

  const scheduleFlush = (): void => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // If we've returned to the last-emitted value, there is nothing to notify.
    if (isEqualHoverTarget(hovered, lastEmitted)) return;

    debounceTimer = setTimeout(flush, DEFAULT_DEBOUNCE_MS);
  };

  const setHovered: HoverState['setHovered'] = (seriesIndex, dataIndex) => {
    const nextHovered: HoverTarget | null =
      isValidIndex(seriesIndex) && isValidIndex(dataIndex) ? { seriesIndex, dataIndex } : null;

    if (isEqualHoverTarget(nextHovered, hovered)) return;
    hovered = nextHovered;
    scheduleFlush();
  };

  const clearHovered: HoverState['clearHovered'] = () => {
    if (hovered === null) return;
    hovered = null;
    scheduleFlush();
  };

  const getHovered: HoverState['getHovered'] = () => copyHoverTargetOrNull(hovered);

  const onChange: HoverState['onChange'] = (callback) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  };

  const destroy: HoverState['destroy'] = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    listeners.clear();
    hovered = null;
    lastEmitted = null;
  };

  return { setHovered, clearHovered, getHovered, onChange, destroy };
}
