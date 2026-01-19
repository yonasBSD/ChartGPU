import { GPUContext, resolveOptions } from '../../src/index';
import type { ChartGPUOptions, DataPoint, SeriesSampling } from '../../src/index';
import { createRenderCoordinator } from '../../src/core/createRenderCoordinator';
import type { RenderCoordinator } from '../../src/core/createRenderCoordinator';
import { createDataZoomSlider } from '../../src/components/createDataZoomSlider';
import type { DataZoomSlider } from '../../src/components/createDataZoomSlider';
import type { ZoomRange, ZoomState } from '../../src/interaction/createZoomState';

const showError = (message: string): void => {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
};

const setText = (id: string, text: string): void => {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
};

const formatInt = (() => {
  const nf = new Intl.NumberFormat(undefined);
  return (n: number): string => nf.format(Math.max(0, Math.floor(n)));
})();

const TOTAL_POINTS = 1_000_000;
const X_MAX = TOTAL_POINTS - 1;

const DATA_ZOOM_SLIDER_HEIGHT_CSS_PX = 32;
const DATA_ZOOM_SLIDER_MARGIN_TOP_CSS_PX = 8;
const DATA_ZOOM_SLIDER_RESERVE_CSS_PX = DATA_ZOOM_SLIDER_HEIGHT_CSS_PX + DATA_ZOOM_SLIDER_MARGIN_TOP_CSS_PX;

const DEFAULT_SAMPLING_THRESHOLD = 8192;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const hasSliderDataZoom = (options: ChartGPUOptions): boolean => options.dataZoom?.some((z) => z?.type === 'slider') ?? false;

const resolveOptionsForBenchmark = (options: ChartGPUOptions) => {
  // Mirror ChartGPU.ts behavior: preserve user tooltip object and reserve bottom space for slider.
  const base = { ...resolveOptions(options), tooltip: options.tooltip };
  if (!hasSliderDataZoom(options)) return base;
  return {
    ...base,
    grid: {
      ...base.grid,
      bottom: base.grid.bottom + DATA_ZOOM_SLIDER_RESERVE_CSS_PX,
    },
  };
};

const createMillionPointsData = (): Readonly<{
  data: ReadonlyArray<DataPoint>;
  yMin: number;
  yMax: number;
}> => {
  const out: DataPoint[] = new Array(TOTAL_POINTS);

  // Synthetic: sine wave + low-frequency component + uniform noise.
  // Keep x strictly increasing and finite (x = index).
  const freq = 0.012;
  const lowFreq = 0.0017;
  const noiseAmp = 0.35;

  // xorshift32 PRNG (deterministic, no allocations).
  let state = 0x12345678 | 0;
  const rand01 = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    // Convert to [0, 1).
    return (state >>> 0) / 4294967296;
  };

  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < TOTAL_POINTS; i++) {
    const x = i;
    const y =
      Math.sin(i * freq) * 0.95 +
      Math.sin(i * lowFreq + 1.1) * 0.6 +
      (rand01() - 0.5) * noiseAmp;

    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;

    out[i] = [x, y] as const;
  }

  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = -2;
    yMax = 2;
  }

  // Add a small pad to avoid touching edges.
  const pad = 0.05 * (yMax - yMin || 1);
  return { data: out, yMin: yMin - pad, yMax: yMax + pad };
};

const computeZoomAwareTarget = (baseThreshold: number, spanFrac: number): number => {
  // Mirrors createRenderCoordinator’s behavior (see examples/sampling/main.ts):
  // - baseline target is samplingThreshold at full span
  // - zooming in increases target ~ 1/spanFrac
  // - capped to avoid pathological allocations
  const MIN_TARGET_POINTS = 2;
  const MAX_TARGET_POINTS_ABS = 200_000;
  const MAX_TARGET_MULTIPLIER = 32;

  const spanFracSafe = Math.max(1e-3, Math.min(1, spanFrac));
  const baseT = Number.isFinite(baseThreshold) ? Math.max(1, baseThreshold | 0) : 1;
  const maxTarget = Math.min(MAX_TARGET_POINTS_ABS, Math.max(MIN_TARGET_POINTS, baseT * MAX_TARGET_MULTIPLIER));

  const v = Math.round(baseT / spanFracSafe);
  return clamp(v | 0, MIN_TARGET_POINTS, maxTarget);
};

const estimateRenderedPoints = (
  totalPoints: number,
  zoomRange: ZoomRange | null,
  sampling: SeriesSampling,
  samplingThreshold: number
): number => {
  const start = zoomRange?.start ?? 0;
  const end = zoomRange?.end ?? 100;
  const spanFrac = Math.max(0, Math.min(1, (end - start) / 100));

  // With x=index and explicit x-domain [0..X_MAX], visible points are ~ proportional to zoom span.
  const visibleRaw = Math.max(2, Math.floor(totalPoints * spanFrac));
  if (sampling === 'none') return visibleRaw;

  const target = computeZoomAwareTarget(samplingThreshold, spanFrac);
  return Math.min(visibleRaw, target);
};

type RollingStat = Readonly<{
  push(value: number): void;
  mean(): number;
}>;

const createRollingStat = (windowSize: number): RollingStat => {
  const buf = new Float64Array(Math.max(1, windowSize | 0));
  let idx = 0;
  let count = 0;
  let sum = 0;

  return {
    push(value) {
      const v = Number.isFinite(value) ? value : 0;
      if (count < buf.length) {
        buf[idx] = v;
        sum += v;
        count++;
        idx = (idx + 1) % buf.length;
        return;
      }

      const prev = buf[idx]!;
      buf[idx] = v;
      sum += v - prev;
      idx = (idx + 1) % buf.length;
    },
    mean() {
      if (count === 0) return 0;
      return sum / count;
    },
  };
};

async function main(): Promise<void> {
  const container = document.getElementById('chart');
  if (!(container instanceof HTMLElement)) throw new Error('Chart container (#chart) not found');

  const samplingEnabledEl = document.getElementById('samplingEnabled');
  const resetZoomEl = document.getElementById('resetZoom');
  if (!(samplingEnabledEl instanceof HTMLInputElement)) throw new Error('samplingEnabled checkbox not found');
  if (!(resetZoomEl instanceof HTMLButtonElement)) throw new Error('resetZoom button not found');

  // Ensure numeric readout is consistent (HTML already sets this, but keep it robust).
  setText('pointCount', formatInt(TOTAL_POINTS));

  // Create a canvas under #chart.
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  let gpuContext: GPUContext | null = null;
  let coordinator: RenderCoordinator | null = null;
  let coordinatorTargetFormat: GPUTextureFormat | null = null;
  let lastConfigured: { width: number; height: number; format: GPUTextureFormat } | null = null;

  let sliderHost: HTMLDivElement | null = null;
  let slider: DataZoomSlider | null = null;
  let unsubscribeZoom: (() => void) | null = null;

  let zoomRange: ZoomRange | null = null;

  const { data, yMin, yMax } = createMillionPointsData();

  const createUserOptions = (sampling: SeriesSampling): ChartGPUOptions => ({
    grid: { left: 70, right: 24, top: 24, bottom: 44 },
    xAxis: { type: 'value', min: 0, max: X_MAX, name: 'Index' },
    yAxis: { type: 'value', min: yMin, max: yMax, name: 'Value' },
    tooltip: { show: false },
    dataZoom: [{ type: 'inside' }, { type: 'slider' }],
    palette: ['#4a9eff'],
    animation: false,
    series: [
      {
        type: 'line',
        name: '1,000,000 points',
        data,
        color: '#4a9eff',
        lineStyle: { width: 1, opacity: 1 },
        sampling,
        samplingThreshold: DEFAULT_SAMPLING_THRESHOLD,
      },
    ],
  });

  let samplingMode: SeriesSampling = samplingEnabledEl.checked ? 'lttb' : 'none';
  let userOptions: ChartGPUOptions = createUserOptions(samplingMode);
  let resolvedOptions = resolveOptionsForBenchmark(userOptions);

  const ensureSliderHost = (): HTMLDivElement => {
    if (sliderHost) return sliderHost;

    // Anchor absolute positioning.
    try {
      const pos = window.getComputedStyle(container).position;
      if (pos === 'static') container.style.position = 'relative';
    } catch {
      // best-effort
    }

    const host = document.createElement('div');
    host.style.position = 'absolute';
    host.style.left = '0';
    host.style.right = '0';
    host.style.bottom = '0';
    host.style.height = `${DATA_ZOOM_SLIDER_RESERVE_CSS_PX}px`;
    host.style.paddingTop = `${DATA_ZOOM_SLIDER_MARGIN_TOP_CSS_PX}px`;
    host.style.boxSizing = 'border-box';
    host.style.pointerEvents = 'auto';
    host.style.zIndex = '5';
    container.appendChild(host);
    sliderHost = host;
    return host;
  };

  const disposeSliderUi = (): void => {
    slider?.dispose();
    slider = null;
    sliderHost?.remove();
    sliderHost = null;
    unsubscribeZoom?.();
    unsubscribeZoom = null;
  };

  const createCoordinatorZoomStateLike = (): ZoomState => {
    const getRange: ZoomState['getRange'] = () => coordinator?.getZoomRange() ?? { start: 0, end: 100 };
    const setRange: ZoomState['setRange'] = (start, end) => coordinator?.setZoomRange(start, end);
    const pan: ZoomState['pan'] = (delta) => {
      const r = coordinator?.getZoomRange();
      if (!r || !Number.isFinite(delta)) return;
      coordinator?.setZoomRange(r.start + delta, r.end + delta);
    };
    const zoomIn: ZoomState['zoomIn'] = () => {
      // Not needed for slider UI; keep as a no-op for interface completeness.
    };
    const zoomOut: ZoomState['zoomOut'] = () => {
      // Not needed for slider UI; keep as a no-op for interface completeness.
    };
    const onChange: ZoomState['onChange'] = (cb) => coordinator?.onZoomRangeChange(cb) ?? (() => {});
    return { getRange, setRange, pan, zoomIn, zoomOut, onChange };
  };

  const syncSliderUi = (): void => {
    if (!coordinator) return;
    const hasZoom = !!coordinator.getZoomRange();
    if (!hasZoom) return;

    if (!slider) {
      const host = ensureSliderHost();
      slider = createDataZoomSlider(host, createCoordinatorZoomStateLike(), {
        height: DATA_ZOOM_SLIDER_HEIGHT_CSS_PX,
        marginTop: 0, // host provides spacing
      });
    }
    slider.update(resolvedOptions.theme);
  };

  const resizeCanvasAndConfigure = (): void => {
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

    if (!device || !canvasContext || !preferredFormat) return;

    const shouldConfigure =
      sizeChanged ||
      !lastConfigured ||
      lastConfigured.width !== canvas.width ||
      lastConfigured.height !== canvas.height ||
      lastConfigured.format !== preferredFormat;

    if (!shouldConfigure) return;

    canvasContext.configure({
      device,
      format: preferredFormat,
      alphaMode: 'opaque',
    });
    lastConfigured = { width: canvas.width, height: canvas.height, format: preferredFormat };

    if (coordinator && coordinatorTargetFormat !== preferredFormat) {
      coordinator.dispose();
      coordinator = createRenderCoordinator(gpuContext!, resolvedOptions);
      coordinatorTargetFormat = preferredFormat;
      syncSliderUi();
    }
  };

  const recreateCoordinator = (): void => {
    if (!gpuContext) return;
    const prevZoom = coordinator?.getZoomRange() ?? null;

    coordinator?.dispose();
    coordinator = createRenderCoordinator(gpuContext, resolvedOptions);
    coordinatorTargetFormat = gpuContext.preferredFormat;

    // Best-effort preserve zoom window.
    if (prevZoom) coordinator.setZoomRange(prevZoom.start, prevZoom.end);

    unsubscribeZoom?.();
    unsubscribeZoom = coordinator.onZoomRangeChange((r) => {
      zoomRange = { start: r.start, end: r.end };
    });
    zoomRange = coordinator.getZoomRange();

    syncSliderUi();
  };

  // Coalesced resize observer (keeps canvas backing size in sync without DOM thrash).
  const ro = (() => {
    let rafId: number | null = null;
    const schedule = (): void => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        resizeCanvasAndConfigure();
      });
    };
    const r = new ResizeObserver(() => schedule());
    r.observe(container);
    return r;
  })();

  let rafId: number | null = null;
  const frameDtMs = createRollingStat(60);
  const renderMs = createRollingStat(60);
  const gpuMs = createRollingStat(60);
  let gpuTimingInFlight = false;
  let gpuTimingSubmitTs = 0;

  let lastFrameTs = 0;
  let lastDomUpdateTs = 0;
  let lastRenderedPointsText = '';
  let lastFpsText = '';
  let lastRenderMsText = '';
  let lastGpuMsText = '';

  const updateStatsDom = (nowTs: number): void => {
    if (nowTs - lastDomUpdateTs < 250) return;
    lastDomUpdateTs = nowTs;

    const avgDt = frameDtMs.mean();
    const fps = avgDt > 0 ? 1000 / avgDt : 0;
    const avgRender = renderMs.mean();
    const avgGpu = gpuMs.mean();

    const fpsText = fps > 0 ? fps.toFixed(1) : '—';
    const renderText = avgRender > 0 ? avgRender.toFixed(2) : '—';
    const gpuText = avgGpu > 0 ? avgGpu.toFixed(2) : '—';

    const renderedPoints = estimateRenderedPoints(TOTAL_POINTS, zoomRange, samplingMode, DEFAULT_SAMPLING_THRESHOLD);
    const renderedPointsText = formatInt(renderedPoints);

    if (fpsText !== lastFpsText) {
      lastFpsText = fpsText;
      setText('fps', fpsText);
    }
    if (renderText !== lastRenderMsText) {
      lastRenderMsText = renderText;
      setText('renderTimeMs', renderText);
    }
    if (gpuText !== lastGpuMsText) {
      lastGpuMsText = gpuText;
      setText('gpuTimeMs', gpuText);
    }
    if (renderedPointsText !== lastRenderedPointsText) {
      lastRenderedPointsText = renderedPointsText;
      setText('renderedPointCount', renderedPointsText);
    }
  };

  const scheduleGpuTimingProbe = (submitTs: number): void => {
    const device = gpuContext?.device;
    if (!device) return;
    if (gpuTimingInFlight) return;

    gpuTimingInFlight = true;
    gpuTimingSubmitTs = submitTs;

    // Note: onSubmittedWorkDone resolves when all work submitted before this call is complete.
    // We intentionally keep only one probe in-flight to avoid creating many promises.
    device.queue
      .onSubmittedWorkDone()
      .then(() => {
        gpuTimingInFlight = false;
        // If GPUContext/device was torn down or replaced, ignore this sample.
        if (gpuContext?.device !== device) return;
        const doneTs = performance.now();
        gpuMs.push(doneTs - gpuTimingSubmitTs);
      })
      .catch(() => {
        // Ignore errors (device lost/destroyed).
        gpuTimingInFlight = false;
      });
  };

  const renderLoop = (ts: number): void => {
    rafId = requestAnimationFrame(renderLoop);

    if (lastFrameTs > 0) frameDtMs.push(ts - lastFrameTs);
    lastFrameTs = ts;

    if (coordinator && gpuContext?.device) {
      const t0 = performance.now();
      coordinator.render();
      const t1 = performance.now();
      renderMs.push(t1 - t0);
      scheduleGpuTimingProbe(t1);
    }

    updateStatsDom(ts);
  };

  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;

    if (rafId !== null) cancelAnimationFrame(rafId);
    ro.disconnect();
    disposeSliderUi();
    coordinator?.dispose();
    coordinator = null;
    gpuContext?.destroy();
    gpuContext = null;
    canvas.remove();
  };

  try {
    // Establish initial canvas size before WebGPU init so GPUContext sees non-zero dimensions.
    resizeCanvasAndConfigure();

    gpuContext = await GPUContext.create(canvas);
    gpuContext.device?.lost.then((info) => {
      if (cleanedUp) return;
      if (info.reason !== 'destroyed') {
        console.warn('WebGPU device lost:', info);
      }
      showError('WebGPU device lost. This benchmark will stop.');
      cleanup();
    });

    // Ensure size/config are correct with the real device limits/format.
    resizeCanvasAndConfigure();

    // Coordinator + zoom + slider.
    recreateCoordinator();

    // Controls.
    samplingEnabledEl.addEventListener('change', () => {
      const nextSampling: SeriesSampling = samplingEnabledEl.checked ? 'lttb' : 'none';
      if (nextSampling === samplingMode) return;

      samplingMode = nextSampling;
      userOptions = createUserOptions(samplingMode);
      resolvedOptions = resolveOptionsForBenchmark(userOptions);

      const prevZoom = coordinator?.getZoomRange() ?? null;
      coordinator?.setOptions(resolvedOptions);
      if (prevZoom) coordinator?.setZoomRange(prevZoom.start, prevZoom.end);

      slider?.update(resolvedOptions.theme);
    });

    resetZoomEl.addEventListener('click', () => {
      coordinator?.setZoomRange(0, 100);
    });

    // Start loop.
    rafId = requestAnimationFrame(renderLoop);

    window.addEventListener('beforeunload', cleanup);
    import.meta.hot?.dispose(cleanup);
  } catch (err) {
    cleanup();
    throw err;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    main().catch((err) => {
      console.error(err);
      showError(err instanceof Error ? err.message : String(err));
    });
  });
} else {
  main().catch((err) => {
    console.error(err);
    showError(err instanceof Error ? err.message : String(err));
  });
}

