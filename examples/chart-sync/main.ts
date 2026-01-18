import { ChartGPU, connectCharts } from '../../src/index';
import type { ChartGPUOptions, DataPoint, ChartGPUInstance } from '../../src/index';

const createWave = (
  count: number,
  opts: Readonly<{ phase: number; amplitude: number; fn: 'sin' | 'cos' }>
): ReadonlyArray<DataPoint> => {
  const n = Math.max(2, Math.floor(count));
  const out: DataPoint[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = t * Math.PI * 2;
    const base = opts.fn === 'sin' ? Math.sin(x + opts.phase) : Math.cos(x + opts.phase);
    out[i] = [x, base * opts.amplitude] as const;
  }

  return out;
};

const showError = (message: string): void => {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
};

const createOptions = (title: string, data: ReadonlyArray<DataPoint>, color: string): ChartGPUOptions => {
  const xMax = Math.PI * 2;
  return {
    grid: { left: 70, right: 24, top: 24, bottom: 56 },
    xAxis: { type: 'value', min: 0, max: xMax, name: 'Angle (rad)' },
    yAxis: { type: 'value', min: -1.2, max: 1.2, name: title },
    palette: [color],
    tooltip: { trigger: 'axis' },
    series: [
      {
        type: 'line',
        name: title,
        data,
        color,
        lineStyle: { width: 2, opacity: 1 },
      },
    ],
  };
};

async function main() {
  const containerA = document.getElementById('chart-a');
  const containerB = document.getElementById('chart-b');
  if (!containerA || !containerB) throw new Error('Chart containers not found');

  const dataA = createWave(400, { fn: 'sin', phase: 0, amplitude: 1 });
  const dataB = createWave(400, { fn: 'cos', phase: Math.PI / 6, amplitude: 0.9 });

  const chartA = await ChartGPU.create(containerA, createOptions('sin(x)', dataA, '#4a9eff'));
  const chartB = await ChartGPU.create(containerB, createOptions('cos(x + π/6)', dataB, '#ff4ab0'));

  const disconnect = connectCharts([chartA, chartB]);

  const attachResizeObserver = (container: HTMLElement, chart: ChartGPUInstance): ResizeObserver => {
    let scheduled = false;
    const ro = new ResizeObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        chart.resize();
      });
    });
    ro.observe(container);
    return ro;
  };

  const roA = attachResizeObserver(containerA, chartA);
  const roB = attachResizeObserver(containerB, chartB);

  // Initial sizing/render.
  chartA.resize();
  chartB.resize();

  window.addEventListener('beforeunload', () => {
    roA.disconnect();
    roB.disconnect();
    disconnect();
    chartA.dispose();
    chartB.dispose();
  });
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

