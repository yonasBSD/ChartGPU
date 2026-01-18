import { GPUContext } from './core/GPUContext';
import { createRenderCoordinator } from './core/createRenderCoordinator';
import type { RenderCoordinator } from './core/createRenderCoordinator';
import { resolveOptions } from './config/OptionResolver';
import type { ResolvedChartGPUOptions, ResolvedPieSeriesConfig } from './config/OptionResolver';
import type { ChartGPUOptions, DataPoint, DataPointTuple, PieCenter, PieRadius } from './config/types';
import { findNearestPoint } from './interaction/findNearestPoint';
import type { NearestPointMatch } from './interaction/findNearestPoint';
import { findPieSlice } from './interaction/findPieSlice';
import { createLinearScale } from './utils/scales';
import type { LinearScale } from './utils/scales';

export interface ChartGPUInstance {
  readonly options: Readonly<ChartGPUOptions>;
  readonly disposed: boolean;
  setOption(options: ChartGPUOptions): void;
  resize(): void;
  dispose(): void;
  on(eventName: 'crosshairMove', callback: ChartGPUCrosshairMoveCallback): void;
  on(eventName: ChartGPUEventName, callback: ChartGPUEventCallback): void;
  off(eventName: 'crosshairMove', callback: ChartGPUCrosshairMoveCallback): void;
  off(eventName: ChartGPUEventName, callback: ChartGPUEventCallback): void;
  /**
   * Gets the current “interaction x” in domain units (or `null` when inactive).
   *
   * This is derived from pointer movement inside the plot grid and can also be driven
   * externally via `setInteractionX(...)` (e.g. chart sync).
   */
  getInteractionX(): number | null;
  /**
   * Drives the chart’s crosshair + tooltip from a domain-space x value.
   *
   * Passing `null` clears the interaction (hides crosshair/tooltip).
   */
  setInteractionX(x: number | null, source?: unknown): void;
  /**
   * Alias for `setInteractionX(...)` for chart sync semantics.
   */
  setCrosshairX(x: number | null, source?: unknown): void;
  /**
   * Subscribes to interaction x changes (domain units).
   *
   * Returns an unsubscribe function.
   */
  onInteractionXChange(callback: (x: number | null, source?: unknown) => void): () => void;
}

// Type-only alias so callsites can write `ChartGPU[]` for chart instances (while `ChartGPU` the value
// remains the creation API exported from `src/index.ts`).
export type ChartGPU = ChartGPUInstance;

export type ChartGPUEventName = 'click' | 'mouseover' | 'mouseout' | 'crosshairMove';

export type ChartGPUEventPayload = Readonly<{
  readonly seriesIndex: number | null;
  readonly dataIndex: number | null;
  readonly value: readonly [number, number] | null;
  readonly seriesName: string | null;
  readonly event: PointerEvent;
}>;

export type ChartGPUCrosshairMovePayload = Readonly<{
  readonly x: number | null;
  readonly source?: unknown;
}>;

export type ChartGPUEventCallback = (payload: ChartGPUEventPayload) => void;

export type ChartGPUCrosshairMoveCallback = (payload: ChartGPUCrosshairMovePayload) => void;

type AnyChartGPUEventCallback = ChartGPUEventCallback | ChartGPUCrosshairMoveCallback;

type ListenerRegistry = Readonly<Record<ChartGPUEventName, Set<AnyChartGPUEventCallback>>>;

type TapCandidate = {
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startTimeMs: number;
};

const DEFAULT_TAP_MAX_DISTANCE_CSS_PX = 6;
const DEFAULT_TAP_MAX_TIME_MS = 500;

type Bounds = Readonly<{ xMin: number; xMax: number; yMin: number; yMax: number }>;

const isTupleDataPoint = (p: DataPoint): p is DataPointTuple => Array.isArray(p);

const getPointXY = (p: DataPoint): { readonly x: number; readonly y: number } => {
  if (isTupleDataPoint(p)) return { x: p[0], y: p[1] };
  return { x: p.x, y: p.y };
};

type InteractionScalesCache = {
  rectWidthCss: number;
  rectHeightCss: number;
  plotWidthCss: number;
  plotHeightCss: number;
  xDomainMin: number;
  xDomainMax: number;
  yDomainMin: number;
  yDomainMax: number;
  xScale: LinearScale;
  yScale: LinearScale;
};

const computeGlobalBounds = (series: ResolvedChartGPUOptions['series']): Bounds => {
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;

  for (let s = 0; s < series.length; s++) {
    const seriesConfig = series[s];
    // Pie series are non-cartesian; they don't participate in x/y bounds.
    if (seriesConfig.type === 'pie') continue;

    const data = seriesConfig.data;
    for (let i = 0; i < data.length; i++) {
      const { x, y } = getPointXY(data[i]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }

  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  }

  if (xMin === xMax) xMax = xMin + 1;
  if (yMin === yMax) yMax = yMin + 1;

  return { xMin, xMax, yMin, yMax };
};

const normalizeDomain = (
  minCandidate: number,
  maxCandidate: number
): { readonly min: number; readonly max: number } => {
  let min = minCandidate;
  let max = maxCandidate;

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }

  if (min === max) {
    max = min + 1;
  } else if (min > max) {
    const t = min;
    min = max;
    max = t;
  }

  return { min, max };
};

type CartesianHitTestMatch = Readonly<{
  kind: 'cartesian';
  match: NearestPointMatch;
}>;

type PieHitTestMatch = Readonly<{
  kind: 'pie';
  seriesIndex: number;
  dataIndex: number;
  sliceValue: number;
}>;

type HitTestMatch = CartesianHitTestMatch | PieHitTestMatch;

const parseNumberOrPercent = (value: number | string, basis: number): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const s = value.trim();
  if (s.length === 0) return null;

  if (s.endsWith('%')) {
    const pct = Number.parseFloat(s.slice(0, -1));
    if (!Number.isFinite(pct)) return null;
    return (pct / 100) * basis;
  }

  // Be permissive: allow numeric strings like "120" even though the public type primarily documents percent strings.
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

const resolvePieCenterPlotCss = (
  center: PieCenter | undefined,
  plotWidthCss: number,
  plotHeightCss: number
): { readonly x: number; readonly y: number } => {
  const xRaw = center?.[0] ?? '50%';
  const yRaw = center?.[1] ?? '50%';

  const x = parseNumberOrPercent(xRaw, plotWidthCss);
  const y = parseNumberOrPercent(yRaw, plotHeightCss);

  return {
    x: Number.isFinite(x) ? x! : plotWidthCss * 0.5,
    y: Number.isFinite(y) ? y! : plotHeightCss * 0.5,
  };
};

const isPieRadiusTuple = (radius: PieRadius): radius is readonly [inner: number | string, outer: number | string] =>
  Array.isArray(radius);

const resolvePieRadiiCss = (
  radius: PieRadius | undefined,
  maxRadiusCss: number
): { readonly inner: number; readonly outer: number } => {
  // Default similar to common chart libs (mirrors `createPieRenderer.ts` and coordinator helpers).
  if (radius == null) return { inner: 0, outer: maxRadiusCss * 0.7 };

  if (isPieRadiusTuple(radius)) {
    const inner = parseNumberOrPercent(radius[0], maxRadiusCss);
    const outer = parseNumberOrPercent(radius[1], maxRadiusCss);
    const innerCss = Math.max(0, Number.isFinite(inner) ? inner! : 0);
    const outerCss = Math.max(innerCss, Number.isFinite(outer) ? outer! : maxRadiusCss * 0.7);
    return { inner: innerCss, outer: Math.min(maxRadiusCss, outerCss) };
  }

  const outer = parseNumberOrPercent(radius, maxRadiusCss);
  const outerCss = Math.max(0, Number.isFinite(outer) ? outer! : maxRadiusCss * 0.7);
  return { inner: 0, outer: Math.min(maxRadiusCss, outerCss) };
};

export async function createChartGPU(
  container: HTMLElement,
  options: ChartGPUOptions
): Promise<ChartGPUInstance> {
  const canvas = document.createElement('canvas');

  // Ensure the canvas participates in layout and can size via the container.
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  // Append before awaiting so it appears immediately and has measurable size.
  container.appendChild(canvas);

  let disposed = false;
  let gpuContext: GPUContext | null = null;
  let coordinator: RenderCoordinator | null = null;
  let coordinatorTargetFormat: GPUTextureFormat | null = null;
  let unsubscribeCoordinatorInteractionXChange: (() => void) | null = null;

  let currentOptions: ChartGPUOptions = options;
  let resolvedOptions: ResolvedChartGPUOptions = {
    ...resolveOptions(currentOptions),
    tooltip: currentOptions.tooltip,
  };

  // Cache global bounds and interaction scales; avoids O(N) data scans per pointer move.
  let cachedGlobalBounds: Bounds = computeGlobalBounds(resolvedOptions.series);
  let interactionScalesCache: InteractionScalesCache | null = null;

  const listeners: ListenerRegistry = {
    click: new Set<ChartGPUEventCallback>(),
    mouseover: new Set<ChartGPUEventCallback>(),
    mouseout: new Set<ChartGPUEventCallback>(),
    crosshairMove: new Set<ChartGPUCrosshairMoveCallback>(),
  };

  let tapCandidate: TapCandidate | null = null;
  let suppressNextLostPointerCaptureId: number | null = null;

  let hovered: HitTestMatch | null = null;

  let scheduledRaf: number | null = null;
  let lastConfigured: { width: number; height: number; format: GPUTextureFormat } | null = null;

  const hasHoverListeners = (): boolean => listeners.mouseover.size > 0 || listeners.mouseout.size > 0;
  const hasClickListeners = (): boolean => listeners.click.size > 0;

  const cancelPendingFrame = (): void => {
    if (scheduledRaf === null) return;
    cancelAnimationFrame(scheduledRaf);
    scheduledRaf = null;
  };

  const requestRender = (): void => {
    if (disposed) return;
    if (scheduledRaf !== null) return;

    scheduledRaf = requestAnimationFrame(() => {
      scheduledRaf = null;
      if (disposed) return;

      // Requirement: on RAF tick, call resize() first.
      resizeInternal(false);
      coordinator?.render();
    });
  };

  const unbindCoordinatorInteractionXChange = (): void => {
    if (!unsubscribeCoordinatorInteractionXChange) return;
    try {
      unsubscribeCoordinatorInteractionXChange();
    } finally {
      unsubscribeCoordinatorInteractionXChange = null;
    }
  };

  const bindCoordinatorInteractionXChange = (): void => {
    unbindCoordinatorInteractionXChange();
    if (disposed) return;
    if (!coordinator) return;

    unsubscribeCoordinatorInteractionXChange = coordinator.onInteractionXChange((x, source) => {
      emit('crosshairMove', { x, source });
    });
  };

  const recreateCoordinator = (): void => {
    if (disposed) return;
    if (!gpuContext || !gpuContext.initialized) return;

    unbindCoordinatorInteractionXChange();
    coordinator?.dispose();
    coordinator = createRenderCoordinator(gpuContext, resolvedOptions, { onRequestRender: requestRender });
    coordinatorTargetFormat = gpuContext.preferredFormat;
    bindCoordinatorInteractionXChange();
  };

  const resizeInternal = (shouldRequestRenderAfterChanges: boolean): void => {
    if (disposed) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const maxDimension = gpuContext?.device?.limits.maxTextureDimension2D ?? 8192;
    const width = Math.min(maxDimension, Math.max(1, Math.round(rect.width * dpr)));
    const height = Math.min(maxDimension, Math.max(1, Math.round(rect.height * dpr)));

    const sizeChanged = canvas.width !== width || canvas.height !== height;
    if (sizeChanged) {
      canvas.width = width;
      canvas.height = height;
    }

    const device = gpuContext?.device;
    const canvasContext = gpuContext?.canvasContext;
    const preferredFormat = gpuContext?.preferredFormat;

    let didConfigure = false;
    if (device && canvasContext && preferredFormat) {
      const shouldConfigure =
        sizeChanged ||
        !lastConfigured ||
        lastConfigured.width !== canvas.width ||
        lastConfigured.height !== canvas.height ||
        lastConfigured.format !== preferredFormat;

      if (shouldConfigure) {
        canvasContext.configure({
          device,
          format: preferredFormat,
          alphaMode: 'opaque',
        });
        lastConfigured = { width: canvas.width, height: canvas.height, format: preferredFormat };
        didConfigure = true;

        // Requirement: if the target format changes, recreate coordinator/pipelines.
        if (coordinator && coordinatorTargetFormat !== preferredFormat) {
          recreateCoordinator();
        }
      }
    }

    if (shouldRequestRenderAfterChanges && (sizeChanged || didConfigure)) {
      // Requirement: resize() requests a render after size/config changes.
      requestRender();
    }
  };

  const resize = (): void => resizeInternal(true);

  const getNearestPointFromPointerEvent = (
    e: PointerEvent
  ): { readonly match: HitTestMatch | null; readonly isInGrid: boolean } => {
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return { match: null, isInGrid: false };

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const plotLeftCss = resolvedOptions.grid.left;
    const plotTopCss = resolvedOptions.grid.top;
    const plotWidthCss = rect.width - resolvedOptions.grid.left - resolvedOptions.grid.right;
    const plotHeightCss = rect.height - resolvedOptions.grid.top - resolvedOptions.grid.bottom;
    if (!(plotWidthCss > 0) || !(plotHeightCss > 0)) return { match: null, isInGrid: false };

    const gridX = x - plotLeftCss;
    const gridY = y - plotTopCss;

    const isInGrid =
      gridX >= 0 &&
      gridX <= plotWidthCss &&
      gridY >= 0 &&
      gridY <= plotHeightCss;

    if (!isInGrid) return { match: null, isInGrid: false };

    const xMin = resolvedOptions.xAxis.min ?? cachedGlobalBounds.xMin;
    const xMax = resolvedOptions.xAxis.max ?? cachedGlobalBounds.xMax;
    const yMin = resolvedOptions.yAxis.min ?? cachedGlobalBounds.yMin;
    const yMax = resolvedOptions.yAxis.max ?? cachedGlobalBounds.yMax;

    const xDomain = normalizeDomain(xMin, xMax);
    const yDomain = normalizeDomain(yMin, yMax);

    // Cache hit-testing scales for identical (rect, grid, axis domain) inputs.
    const canReuseScales =
      interactionScalesCache !== null &&
      interactionScalesCache.rectWidthCss === rect.width &&
      interactionScalesCache.rectHeightCss === rect.height &&
      interactionScalesCache.plotWidthCss === plotWidthCss &&
      interactionScalesCache.plotHeightCss === plotHeightCss &&
      interactionScalesCache.xDomainMin === xDomain.min &&
      interactionScalesCache.xDomainMax === xDomain.max &&
      interactionScalesCache.yDomainMin === yDomain.min &&
      interactionScalesCache.yDomainMax === yDomain.max;

    if (!canReuseScales) {
      // IMPORTANT: grid-local CSS px ranges (0..plotWidth/Height), for interaction hit-testing.
      const xScale = createLinearScale().domain(xDomain.min, xDomain.max).range(0, plotWidthCss);
      const yScale = createLinearScale().domain(yDomain.min, yDomain.max).range(plotHeightCss, 0);
      interactionScalesCache = {
        rectWidthCss: rect.width,
        rectHeightCss: rect.height,
        plotWidthCss,
        plotHeightCss,
        xDomainMin: xDomain.min,
        xDomainMax: xDomain.max,
        yDomainMin: yDomain.min,
        yDomainMax: yDomain.max,
        xScale,
        yScale,
      };
    }

    // At this point, the cache must exist (either reused or created above).
    const scales = interactionScalesCache!;

    // Story 4.14: pie slice hit-testing (grid-local CSS px).
    const pieMatch = (() => {
      const maxRadiusCss = 0.5 * Math.min(plotWidthCss, plotHeightCss);
      if (!(maxRadiusCss > 0)) return null;

      // Prefer later series indices (deterministic and mirrors the coordinator tooltip logic).
      for (let i = resolvedOptions.series.length - 1; i >= 0; i--) {
        const s = resolvedOptions.series[i];
        if (s.type !== 'pie') continue;
        const pieSeries = s as ResolvedPieSeriesConfig;
        const center = resolvePieCenterPlotCss(pieSeries.center, plotWidthCss, plotHeightCss);
        const radii = resolvePieRadiiCss(pieSeries.radius, maxRadiusCss);
        const m = findPieSlice(gridX, gridY, { seriesIndex: i, series: pieSeries }, center, radii);
        if (!m) continue;

        const v = m.slice.value;
        return {
          kind: 'pie' as const,
          seriesIndex: m.seriesIndex,
          dataIndex: m.dataIndex,
          sliceValue: typeof v === 'number' && Number.isFinite(v) ? v : 0,
        };
      }
      return null;
    })();

    if (pieMatch) return { match: pieMatch, isInGrid: true };

    const cartesianMatch = findNearestPoint(
      resolvedOptions.series,
      gridX,
      gridY,
      scales.xScale,
      scales.yScale
    );

    return {
      match: cartesianMatch ? ({ kind: 'cartesian', match: cartesianMatch } as const) : null,
      isInGrid: true,
    };
  };

  const buildPayload = (match: HitTestMatch | null, event: PointerEvent): ChartGPUEventPayload => {
    if (!match) {
      return { seriesIndex: null, dataIndex: null, value: null, seriesName: null, event };
    }

    const seriesIndex = match.kind === 'cartesian' ? match.match.seriesIndex : match.seriesIndex;
    const dataIndex = match.kind === 'cartesian' ? match.match.dataIndex : match.dataIndex;

    const series = resolvedOptions.series[seriesIndex];
    const seriesNameRaw = series?.name ?? null;
    const seriesName = seriesNameRaw && seriesNameRaw.trim().length > 0 ? seriesNameRaw : null;

    if (match.kind === 'pie') {
      // Pie series are non-cartesian; expose slice value in y so consumers can read a numeric.
      return {
        seriesIndex,
        dataIndex,
        value: [0, match.sliceValue],
        seriesName,
        event,
      };
    }

    const { x, y } = getPointXY(match.match.point);
    return {
      seriesIndex,
      dataIndex,
      value: [x, y],
      seriesName,
      event,
    };
  };

  const emit = (
    eventName: ChartGPUEventName,
    payload: ChartGPUEventPayload | ChartGPUCrosshairMovePayload
  ): void => {
    if (disposed) return;
    for (const cb of listeners[eventName]) (cb as (p: typeof payload) => void)(payload);
  };

  const setHovered = (next: HitTestMatch | null, event: PointerEvent): void => {
    const prev = hovered;
    hovered = next;

    if (prev === null && next === null) return;

    if (prev === null && next !== null) {
      emit('mouseover', buildPayload(next, event));
      return;
    }

    if (prev !== null && next === null) {
      emit('mouseout', buildPayload(prev, event));
      return;
    }

    if (prev === null || next === null) return;

    const prevSeriesIndex = prev.kind === 'cartesian' ? prev.match.seriesIndex : prev.seriesIndex;
    const prevDataIndex = prev.kind === 'cartesian' ? prev.match.dataIndex : prev.dataIndex;
    const nextSeriesIndex = next.kind === 'cartesian' ? next.match.seriesIndex : next.seriesIndex;
    const nextDataIndex = next.kind === 'cartesian' ? next.match.dataIndex : next.dataIndex;

    const samePoint = prevSeriesIndex === nextSeriesIndex && prevDataIndex === nextDataIndex;
    if (samePoint) return;

    emit('mouseout', buildPayload(prev, event));
    emit('mouseover', buildPayload(next, event));
  };

  const clearTapCandidateIfMatches = (e: PointerEvent): void => {
    if (!tapCandidate) return;
    if (!e.isPrimary) return;
    if (e.pointerId !== tapCandidate.pointerId) return;
    tapCandidate = null;
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (disposed) return;
    if (!hasHoverListeners()) return;
    const { match, isInGrid } = getNearestPointFromPointerEvent(e);
    if (!isInGrid) {
      setHovered(null, e);
      return;
    }
    setHovered(match, e);
  };

  const onPointerLeave = (e: PointerEvent): void => {
    if (disposed) return;
    if (!hasHoverListeners() && !tapCandidate) return;
    clearTapCandidateIfMatches(e);
    setHovered(null, e);
  };

  const onPointerCancel = (e: PointerEvent): void => {
    if (disposed) return;
    if (!hasHoverListeners() && !tapCandidate) return;
    clearTapCandidateIfMatches(e);
    setHovered(null, e);
  };

  const onLostPointerCapture = (e: PointerEvent): void => {
    if (disposed) return;
    if (!hasHoverListeners() && !tapCandidate && suppressNextLostPointerCaptureId !== e.pointerId) return;
    if (suppressNextLostPointerCaptureId === e.pointerId) {
      suppressNextLostPointerCaptureId = null;
      return;
    }
    clearTapCandidateIfMatches(e);
    setHovered(null, e);
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (disposed) return;
    if (!hasClickListeners()) return;
    if (!e.isPrimary) return;

    // For mouse, only allow left button.
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    tapCandidate = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startTimeMs: e.timeStamp,
    };

    // Optional pointer capture improves reliability for touch/pen.
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // best-effort
    }
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (disposed) return;
    if (!hasClickListeners()) return;
    if (!e.isPrimary) return;
    if (!tapCandidate || e.pointerId !== tapCandidate.pointerId) return;

    const dt = e.timeStamp - tapCandidate.startTimeMs;
    const dx = e.clientX - tapCandidate.startClientX;
    const dy = e.clientY - tapCandidate.startClientY;
    const distSq = dx * dx + dy * dy;

    tapCandidate = null;

    // Release capture if we have it; suppress the resulting lostpointercapture.
    try {
      if (canvas.hasPointerCapture(e.pointerId)) {
        suppressNextLostPointerCaptureId = e.pointerId;
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      // best-effort
    }

    const maxDist = DEFAULT_TAP_MAX_DISTANCE_CSS_PX;
    const isTap = dt <= DEFAULT_TAP_MAX_TIME_MS && distSq <= maxDist * maxDist;
    if (!isTap) return;

    const { match } = getNearestPointFromPointerEvent(e);
    emit('click', buildPayload(match, e));
  };

  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });
  canvas.addEventListener('pointercancel', onPointerCancel, { passive: true });
  canvas.addEventListener('lostpointercapture', onLostPointerCapture, { passive: true });
  canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
  canvas.addEventListener('pointerup', onPointerUp, { passive: true });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;

    try {
      // Requirement: dispose order: cancel RAF, coordinator.dispose(), gpuContext.destroy(), remove canvas.
      cancelPendingFrame();
      unbindCoordinatorInteractionXChange();
      coordinator?.dispose();
      coordinator = null;
      coordinatorTargetFormat = null;
      gpuContext?.destroy();
    } finally {
      tapCandidate = null;
      suppressNextLostPointerCaptureId = null;
      hovered = null;
      interactionScalesCache = null;

      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('lostpointercapture', onLostPointerCapture);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);

      listeners.click.clear();
      listeners.mouseover.clear();
      listeners.mouseout.clear();
      listeners.crosshairMove.clear();

      gpuContext = null;
      canvas.remove();
    }
  };

  const instance: ChartGPUInstance = {
    get options() {
      return currentOptions;
    },
    get disposed() {
      return disposed;
    },
    setOption(nextOptions) {
      if (disposed) return;
      currentOptions = nextOptions;
      resolvedOptions = { ...resolveOptions(nextOptions), tooltip: nextOptions.tooltip };
      coordinator?.setOptions(resolvedOptions);
      cachedGlobalBounds = computeGlobalBounds(resolvedOptions.series);
      interactionScalesCache = null;

      // Requirement: setOption triggers a render (and thus series parsing/extent/scales update inside render).
      requestRender();
    },
    resize,
    dispose,
    on(eventName, callback) {
      if (disposed) return;
      listeners[eventName].add(callback as AnyChartGPUEventCallback);
    },
    off(eventName, callback) {
      listeners[eventName].delete(callback as AnyChartGPUEventCallback);
    },
    getInteractionX() {
      if (disposed) return null;
      return coordinator?.getInteractionX() ?? null;
    },
    setInteractionX(x, source) {
      if (disposed) return;
      coordinator?.setInteractionX(x, source);
    },
    setCrosshairX(x, source) {
      if (disposed) return;
      coordinator?.setInteractionX(x, source);
    },
    onInteractionXChange(callback) {
      if (disposed) return () => {};
      return coordinator?.onInteractionXChange(callback) ?? (() => {});
    },
  };

  try {
    // Establish initial canvas backing size before WebGPU initialization.
    resizeInternal(false);

    gpuContext = await GPUContext.create(canvas);
    gpuContext.device?.lost.then((info) => {
      if (disposed) return;
      if (info.reason !== 'destroyed') {
        console.warn('WebGPU device lost:', info);
      }
      // Requirement: device loss routes through the same dispose path.
      dispose();
    });

    // Ensure canvas configuration matches the final measured size/format.
    resizeInternal(false);

    // Requirement: after GPUContext is initialized, create RenderCoordinator with resolved options.
    recreateCoordinator();

    // Kick an initial render.
    requestRender();
    return instance;
  } catch (error) {
    instance.dispose();
    throw error;
  }
}

export const ChartGPU = {
  create: createChartGPU,
};

