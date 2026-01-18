import { ChartGPU } from '../../src/index';
import type { ChartGPUInstance, ChartGPUOptions, DataPoint, SeriesSampling } from '../../src/index';

const showError = (message: string): void => {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
};

const formatInt = (n: number): string => new Intl.NumberFormat(undefined).format(Math.max(0, Math.floor(n)));

const setText = (id: string, text: string): void => {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
};

const createZoomyLineData = (count: number): ReadonlyArray<DataPoint> => {
  const n = Math.max(2, Math.floor(count));
  const out: DataPoint[] = new Array(n);

  // Sorted increasing x by construction.
  // Make high-frequency detail that becomes obvious once you zoom in (more points kept),
  // plus occasional spikes that are easy to spot at high zoom.
  const spikeCenters = [12_500, 31_000, 48_000, 66_500, 84_250];
  const spikeSigma = 34; // narrow spike in index units

  for (let i = 0; i < n; i++) {
    const x = i;

    const slow = Math.sin(i * 0.0014) * 1.2 + Math.sin(i * 0.00017 + 1.1) * 0.6;
    const hf = Math.sin(i * 0.085) * 0.25 + Math.sin(i * 0.17 + 0.4) * 0.12;

    let spike = 0;
    for (const c of spikeCenters) {
      const d = i - c;
      spike += 6.5 * Math.exp(-(d * d) / (2 * spikeSigma * spikeSigma));
    }

    out[i] = [x, slow + hf + spike] as const;
  }

  return out;
};

const attachCoalescedResizeObserver = (
  containers: ReadonlyArray<HTMLElement>,
  charts: ReadonlyArray<ChartGPUInstance>
): ResizeObserver => {
  let rafId: number | null = null;
  const schedule = (): void => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      for (const chart of charts) chart.resize();
    });
  };

  const ro = new ResizeObserver(() => schedule());
  for (const el of containers) ro.observe(el);
  return ro;
};

const normalizeSamplingMode = (value: string | null): SeriesSampling => {
  switch (value) {
    case 'none':
    case 'lttb':
    case 'average':
    case 'max':
    case 'min':
      return value;
    default:
      return 'lttb';
  }
};

const normalizeThreshold = (value: string | null): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 2000;
  return Math.max(2, Math.floor(n));
};

type SamplingControls = Readonly<{
  mode: SeriesSampling;
  threshold: number;
}>;

const createOptions = (
  data: ReadonlyArray<DataPoint>,
  controls: SamplingControls,
  xMax: number
): ChartGPUOptions => ({
  // Note: when `dataZoom` includes `{ type: 'slider' }`, ChartGPU reserves additional bottom
  // space internally for the slider UI, so this value only needs to cover axis labels/title.
  grid: { left: 70, right: 24, top: 24, bottom: 44 },
  xAxis: { type: 'value', min: 0, max: xMax, name: 'Index' },
  yAxis: { type: 'value', name: 'Value' },
  tooltip: { trigger: 'item' },
  dataZoom: [{ type: 'inside' }, { type: 'slider' }],
  palette: ['#4a9eff'],
  series: [
    {
      type: 'line',
      name: 'zoom-aware sampling',
      data,
      color: '#4a9eff',
      lineStyle: { width: 2, opacity: 1 },
      sampling: controls.mode,
      samplingThreshold: controls.threshold,
    },
  ],
});

const clampInt = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n | 0));

const formatPercent = (n: number): string => `${n.toFixed(2)}%`;

const computeZoomAwareTarget = (baseThreshold: number, spanFrac: number): number => {
  // Mirrors createRenderCoordinator’s behavior:
  // - baseline target is samplingThreshold at full span
  // - zooming in increases target ~ 1/spanFrac
  // - capped to avoid pathological allocations
  const MIN_TARGET_POINTS = 2;
  const MAX_TARGET_POINTS_ABS = 200_000;
  const MAX_TARGET_MULTIPLIER = 32;
  const spanFracSafe = Math.max(1e-3, Math.min(1, spanFrac));

  const baseT = Number.isFinite(baseThreshold) ? Math.max(1, baseThreshold | 0) : 1;
  const maxTarget = Math.min(MAX_TARGET_POINTS_ABS, Math.max(MIN_TARGET_POINTS, baseT * MAX_TARGET_MULTIPLIER));
  return clampInt(Math.round(baseT / spanFracSafe), MIN_TARGET_POINTS, maxTarget);
};

const updateReadouts = (
  rawPointCount: number,
  xMax: number,
  controls: SamplingControls,
  zoom: { start: number; end: number } | null
): void => {
  const start = zoom?.start ?? 0;
  const end = zoom?.end ?? 100;
  const span = Math.max(0, Math.min(100, end) - Math.max(0, start));
  const spanFrac = Math.max(0, Math.min(1, span / 100));

  // With x = index and an explicit x-domain [0..xMax], visible points are ~ proportional to span.
  const visibleRaw = Math.max(2, Math.floor(rawPointCount * spanFrac));
  const target = controls.mode === 'none' ? visibleRaw : computeZoomAwareTarget(controls.threshold, spanFrac);
  const expectedRendered = controls.mode === 'none' ? visibleRaw : Math.min(visibleRaw, target);

  setText('totalPoints', formatInt(rawPointCount));
  setText('xDomain', `0 → ${formatInt(xMax)}`);
  setText('samplingResolved', controls.mode);
  setText('samplingThresholdResolved', formatInt(controls.threshold));

  setText('zoomRange', `${formatPercent(start)} → ${formatPercent(end)}`);
  setText('zoomSpan', `${formatPercent(span)} (of full span)`);
  setText('visibleRawPoints', formatInt(visibleRaw));
  setText('targetPoints', controls.mode === 'none' ? '— (sampling: none)' : formatInt(target));
  setText('expectedRendered', formatInt(expectedRendered));
};

async function main(): Promise<void> {
  const container = document.getElementById('chart');
  if (!(container instanceof HTMLElement)) {
    throw new Error('Chart container not found');
  }

  const modeEl = document.getElementById('samplingMode');
  const thresholdEl = document.getElementById('samplingThreshold');
  const applyEl = document.getElementById('apply');

  if (!(modeEl instanceof HTMLSelectElement)) throw new Error('Sampling mode control not found');
  if (!(thresholdEl instanceof HTMLInputElement)) throw new Error('Sampling threshold control not found');
  if (!(applyEl instanceof HTMLButtonElement)) throw new Error('Apply button not found');

  // Defaults picked to make downsampling obvious when zoomed out.
  modeEl.value = 'lttb';
  thresholdEl.value = '2000';

  const data = createZoomyLineData(100_000);
  const xMax = data.length - 1;

  let controls: SamplingControls = { mode: 'lttb', threshold: 2000 };
  let userOptions: ChartGPUOptions = createOptions(data, controls, xMax);

  const chart = await ChartGPU.create(container, userOptions);

  const ro = attachCoalescedResizeObserver([container], [chart]);

  // Initial sizing/render.
  chart.resize();

  const apply = (): void => {
    controls = {
      mode: normalizeSamplingMode(modeEl.value),
      threshold: normalizeThreshold(thresholdEl.value),
    };

    userOptions = createOptions(data, controls, xMax);
    chart.setOption(userOptions);
    updateReadouts(data.length, xMax, controls, chart.getZoomRange());
  };

  applyEl.addEventListener('click', apply);
  thresholdEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') apply();
  });

  // Keep readouts in sync with slider / inside-zoom updates.
  // (No public zoom-change event yet; polling is cheap.)
  let rafId: number | null = null;
  let lastKey = '';
  const tick = (): void => {
    const z = chart.getZoomRange();
    const key = z
      ? `${z.start.toFixed(3)}:${z.end.toFixed(3)}:${controls.mode}:${controls.threshold}`
      : `null:${controls.mode}:${controls.threshold}`;
    if (key !== lastKey) {
      lastKey = key;
      updateReadouts(data.length, xMax, controls, z);
    }
    rafId = requestAnimationFrame(tick);
  };

  updateReadouts(data.length, xMax, controls, chart.getZoomRange());
  rafId = requestAnimationFrame(tick);

  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (rafId !== null) cancelAnimationFrame(rafId);
    ro.disconnect();
    chart.dispose();
  };

  window.addEventListener('beforeunload', cleanup);
  import.meta.hot?.dispose(cleanup);
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

