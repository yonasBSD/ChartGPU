import { ChartGPU, darkTheme } from '../../src/index';
import type { ChartGPUInstance, ChartGPUOptions, DataPoint, PieDataItem, ThemeConfig } from '../../src/index';

const showError = (message: string): void => {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
};

const setStatus = (message: string): void => {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = message;
};

/**
 * Small deterministic RNG (LCG) for repeatable "random" transitions.
 */
const createRng = (seed: number): (() => number) => {
  let s = (seed >>> 0) || 1;
  return () => {
    // Numerical Recipes LCG constants
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
};

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

const theme: ThemeConfig = {
  ...darkTheme,
  // Match the example shell background so the canvas blends in.
  backgroundColor: '#0f0f14',
  gridLineColor: 'rgba(255,255,255,0.06)',
  axisLineColor: 'rgba(224,224,224,0.14)',
  axisTickColor: 'rgba(224,224,224,0.22)',
  textColor: 'rgba(224,224,224,0.78)',
};

const pieSliceBase: ReadonlyArray<Readonly<{ name: string; color: string; base: number }>> = [
  { name: 'Compute', color: '#00E5FF', base: 42 },
  { name: 'Memory', color: '#FF2D95', base: 30 },
  { name: 'Raster', color: '#B026FF', base: 18 },
  { name: 'Upload', color: '#00F5A0', base: 12 },
  { name: 'Sync', color: '#FFD300', base: 9 },
  { name: 'Other', color: '#FF6B00', base: 6 },
];

const makeCartesianData = (
  count: number,
  rng: () => number,
  params: Readonly<{ phase: number; amplitude: number; offset: number }>
): Readonly<{ bars: ReadonlyArray<DataPoint>; line: ReadonlyArray<DataPoint> }> => {
  const n = Math.max(8, Math.floor(count));
  const bars: DataPoint[] = new Array(n);
  const line: DataPoint[] = new Array(n);

  const twoPi = Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = i;
    const noise = (rng() - 0.5) * 0.18;

    // Keep x stable (match-by-index); change y so update animation is obvious.
    const yLine = params.offset + Math.sin(t * twoPi + params.phase) * params.amplitude + noise;
    const yBar =
      params.offset * 0.4 +
      Math.cos(t * twoPi * 0.75 + params.phase * 0.6) * (params.amplitude * 0.9) +
      (rng() - 0.5) * 0.35;

    line[i] = [x, yLine] as const;
    bars[i] = [x, yBar] as const;
  }

  return { bars, line };
};

const makePieData = (rng: () => number): ReadonlyArray<PieDataItem> => {
  return pieSliceBase.map((s) => {
    // Keep strictly positive values so slices remain stable.
    const jitter = 0.35 + rng() * 1.65;
    const value = Math.max(0.1, s.base * jitter);
    return { name: s.name, value, color: s.color };
  });
};

const createAnimationConfig = (enabled: boolean): ChartGPUOptions['animation'] => {
  if (!enabled) return false;
  return { duration: 700, easing: 'cubicInOut', delay: 0 };
};

const createCartesianOptions = (data: Readonly<{ bars: ReadonlyArray<DataPoint>; line: ReadonlyArray<DataPoint> }>, animation: ChartGPUOptions['animation']): ChartGPUOptions => {
  const n = data.line.length;
  return {
    grid: { left: 70, right: 120, top: 24, bottom: 56 },
    xAxis: { type: 'value', min: 0, max: Math.max(1, n - 1), name: 'Index (match-by-index)' },
    // Intentionally omit y min/max so y-domain changes (from new extents) are visible.
    yAxis: { type: 'value', name: 'Value (auto domain)' },
    theme,
    tooltip: { show: true, trigger: 'axis' },
    animation,
    series: [
      {
        type: 'bar',
        name: 'Bars',
        data: data.bars,
        color: '#4a9eff',
        barWidth: '72%',
        barGap: 0.2,
        barCategoryGap: 0.25,
      },
      {
        type: 'line',
        name: 'Line',
        data: data.line,
        color: '#ff4ab0',
        lineStyle: { width: 2, opacity: 1 },
      },
    ],
  };
};

const createPieOptions = (slices: ReadonlyArray<PieDataItem>, animation: ChartGPUOptions['animation']): ChartGPUOptions => {
  return {
    grid: { left: 24, right: 120, top: 24, bottom: 24 },
    // These axes are unused for pie rendering; keep them minimal.
    xAxis: { type: 'value', min: 0, max: 1, tickLength: 0, name: '' },
    yAxis: { type: 'value', min: 0, max: 1, tickLength: 0, name: '' },
    theme,
    tooltip: { show: true, trigger: 'item' },
    animation,
    series: [
      {
        type: 'pie',
        name: 'Breakdown',
        color: '#00E5FF',
        radius: ['36%', '74%'],
        center: ['50%', '50%'],
        startAngle: 90,
        data: slices,
      },
    ],
  };
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

async function main(): Promise<void> {
  const cartesianEl = document.getElementById('chart-cartesian');
  const pieEl = document.getElementById('chart-pie');
  if (!(cartesianEl instanceof HTMLElement) || !(pieEl instanceof HTMLElement)) {
    throw new Error('Chart containers not found');
  }

  const btnUpdate = document.getElementById('btn-update');
  const toggleAnimate = document.getElementById('toggle-animate');
  const toggleAuto = document.getElementById('toggle-auto');
  if (!(btnUpdate instanceof HTMLButtonElement)) throw new Error('Update button not found');
  if (!(toggleAnimate instanceof HTMLInputElement)) throw new Error('Animate toggle not found');
  if (!(toggleAuto instanceof HTMLInputElement)) throw new Error('Auto toggle not found');

  // First render: disable animation so only subsequent setOption() updates animate.
  const initialRng = createRng(1);
  const initialCartesian = makeCartesianData(64, initialRng, { phase: 0, amplitude: 1.2, offset: 0.0 });
  const initialPie = makePieData(initialRng);

  const cartesianChart = await ChartGPU.create(
    cartesianEl,
    createCartesianOptions(initialCartesian, /* animation */ false)
  );
  const pieChart = await ChartGPU.create(pieEl, createPieOptions(initialPie, /* animation */ false));

  const ro = attachCoalescedResizeObserver([cartesianEl, pieEl], [cartesianChart, pieChart]);

  // Initial sizing/render.
  cartesianChart.resize();
  pieChart.resize();

  let step = 0;
  const updateCharts = (source: 'auto' | 'manual'): void => {
    step++;
    const rng = createRng(1000 + step * 97);

    // Make domain changes obvious: vary amplitude and offset.
    const phase = step * 0.7;
    const amplitude = 0.9 + (step % 4) * 0.65; // 0.9..2.85
    const offset = (step % 2 === 0 ? -0.35 : 0.55) + (rng() - 0.5) * 0.15;

    const cartesianData = makeCartesianData(64, rng, { phase, amplitude, offset });
    const pieSlices = makePieData(rng);

    const animation = createAnimationConfig(toggleAnimate.checked);

    cartesianChart.setOption(createCartesianOptions(cartesianData, animation));
    pieChart.setOption(createPieOptions(pieSlices, animation));

    const label = toggleAnimate.checked ? 'animated' : 'instant';
    setStatus(`Updated (${source}, ${label}) · step ${step} · amp ${amplitude.toFixed(2)} · offset ${clamp(offset, -5, 5).toFixed(2)}`);
  };

  btnUpdate.addEventListener('click', () => updateCharts('manual'));
  toggleAnimate.addEventListener('change', () => {
    setStatus(toggleAnimate.checked ? 'Animations enabled (next update).' : 'Animations disabled (next update).');
  });

  setStatus('Initial render (animation off).');
  if (toggleAuto.checked) {
    setStatus('Initial render (animation off). Auto update scheduled…');
    window.setTimeout(() => updateCharts('auto'), 1000);
  }

  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    ro.disconnect();
    cartesianChart.dispose();
    pieChart.dispose();
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

