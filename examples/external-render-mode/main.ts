/**
 * External Render Mode example
 *
 * Demonstrates app-owned render scheduling via `renderMode: 'external'`.
 * The app runs a single rAF loop and calls `needsRender()` + `renderFrame()`.
 */

import { ChartGPU } from '../../src/index';
import type { ChartGPUInstance, ChartGPUOptions, DataPoint, RenderMode } from '../../src/index';

const createSineWave = (
  count: number,
  opts?: Readonly<{ phase?: number; amplitude?: number }>
): ReadonlyArray<DataPoint> => {
  const n = Math.max(2, Math.floor(count));
  const out: DataPoint[] = new Array(n);
  const phase = opts?.phase ?? 0;
  const amplitude = opts?.amplitude ?? 1;

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = t * Math.PI * 2;
    const y = Math.sin(x + phase) * amplitude;
    out[i] = [x, y] as const;
  }

  return out;
};

const showError = (message: string): void => {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
};

type EventRow = Readonly<{ tag: string; text: string }>;

const makeEventLogger = (rowsEl: HTMLElement, limit: number) => {
  const rows: EventRow[] = [];

  const render = (): void => {
    rowsEl.replaceChildren(
      ...rows.map((r) => {
        const row = document.createElement('div');
        row.className = 'row';

        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = r.tag;

        const rest = document.createElement('span');
        rest.textContent = ` ${r.text}`;

        row.append(tag, rest);
        return row;
      })
    );
  };

  const push = (tag: string, text: string): void => {
    rows.push({ tag, text });
    while (rows.length > limit) rows.shift();
    render();
  };

  return { push };
};

async function main(): Promise<void> {
  const container = document.getElementById('chart');
  const toggleBtn = document.getElementById('toggle-mode');
  const updateBtn = document.getElementById('update-data');
  const modeEl = document.getElementById('mode-display');
  const fpsEl = document.getElementById('fps-display');
  const renderFpsEl = document.getElementById('render-fps-display');
  const eventRowsEl = document.getElementById('event-log-rows');

  if (
    !(container instanceof HTMLElement) ||
    !(toggleBtn instanceof HTMLButtonElement) ||
    !(updateBtn instanceof HTMLButtonElement) ||
    !(modeEl instanceof HTMLElement) ||
    !(fpsEl instanceof HTMLElement) ||
    !(renderFpsEl instanceof HTMLElement) ||
    !(eventRowsEl instanceof HTMLElement)
  ) {
    throw new Error('Required DOM elements not found');
  }

  const log = makeEventLogger(eventRowsEl, 10);

  const options: ChartGPUOptions = {
    renderMode: 'external',
    grid: { left: 70, right: 24, top: 24, bottom: 56 },
    xAxis: { type: 'value', min: 0, max: Math.PI * 2, name: 'x' },
    yAxis: { type: 'value', min: -1.2, max: 1.2, name: 'y' },
    palette: ['#4a9eff', '#ff4ab0'],
    animation: { duration: 650, easing: 'cubicOut', delay: 0 },
    series: [
      {
        type: 'line',
        name: 'Series A',
        data: createSineWave(240, { phase: 0, amplitude: 1 }),
        lineStyle: { width: 2, opacity: 1 },
        areaStyle: { opacity: 0.18 },
      },
      {
        type: 'line',
        name: 'Series B',
        data: createSineWave(240, { phase: Math.PI / 2, amplitude: 0.85 }),
        lineStyle: { width: 2, opacity: 1 },
      },
    ],
  };

  const chart: ChartGPUInstance = await ChartGPU.create(container, options);
  log.push('INIT', `created (mode=${chart.getRenderMode()})`);

  // Events fire immediately in both modes; visuals update on next render.
  chart.on('click', (payload) => {
    const match = payload.match ? `${payload.match.kind} s=${payload.match.seriesIndex} i=${payload.match.dataIndex}` : 'none';
    log.push('CLICK', `match=${match}`);
  });
  chart.on('mouseover', (payload) => {
    const match = payload.match ? `${payload.match.kind} s=${payload.match.seriesIndex} i=${payload.match.dataIndex}` : 'none';
    log.push('HOVER', `match=${match}`);
  });

  // Resize: coalesce into one resize per frame.
  let resizeScheduled = false;
  const ro = new ResizeObserver(() => {
    if (resizeScheduled) return;
    resizeScheduled = true;
    requestAnimationFrame(() => {
      resizeScheduled = false;
      chart.resize();
    });
  });
  ro.observe(container);

  // External loop state.
  let rafId: number | null = null;
  let lastStatsAt = performance.now();
  let loopFrames = 0;
  let renderedFrames = 0;

  const setModeUI = (mode: RenderMode): void => {
    modeEl.textContent = mode;
    toggleBtn.textContent = mode === 'external' ? 'Switch to Auto Mode' : 'Switch to External Mode';
  };

  const stopExternalLoop = (): void => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  };

  const tickExternalLoop = (): void => {
    loopFrames++;

    if (chart.needsRender()) {
      const didRender = chart.renderFrame();
      if (didRender) renderedFrames++;
    }

    const now = performance.now();
    if (now - lastStatsAt >= 1000) {
      const secs = Math.max(0.001, (now - lastStatsAt) / 1000);
      fpsEl.textContent = String(Math.round(loopFrames / secs));
      renderFpsEl.textContent = String(Math.round(renderedFrames / secs));
      loopFrames = 0;
      renderedFrames = 0;
      lastStatsAt = now;
    }

    rafId = requestAnimationFrame(tickExternalLoop);
  };

  const startExternalLoop = (): void => {
    if (rafId !== null) return;
    lastStatsAt = performance.now();
    loopFrames = 0;
    renderedFrames = 0;
    rafId = requestAnimationFrame(tickExternalLoop);
  };

  // Initial size + initial external loop.
  chart.resize();
  setModeUI(chart.getRenderMode());
  startExternalLoop();

  let variant = 0;
  updateBtn.addEventListener('click', () => {
    variant = (variant + 1) % 3;
    const phaseA = [0, Math.PI / 4, Math.PI / 7][variant] ?? 0;
    const phaseB = [Math.PI / 2, Math.PI / 3, (2 * Math.PI) / 3][variant] ?? Math.PI / 2;
    const ampA = [1, 1.1, 0.92][variant] ?? 1;
    const ampB = [0.85, 0.72, 1.0][variant] ?? 0.85;

    chart.setOption({
      series: [
        {
          type: 'line',
          name: 'Series A',
          data: createSineWave(240, { phase: phaseA, amplitude: ampA }),
          lineStyle: { width: 2, opacity: 1 },
          areaStyle: { opacity: 0.18 },
        },
        {
          type: 'line',
          name: 'Series B',
          data: createSineWave(240, { phase: phaseB, amplitude: ampB }),
          lineStyle: { width: 2, opacity: 1 },
        },
      ],
    });

    log.push('DATA', `setOption() variant=${variant + 1}`);
  });

  toggleBtn.addEventListener('click', () => {
    const next: RenderMode = chart.getRenderMode() === 'external' ? 'auto' : 'external';
    chart.setRenderMode(next);
    setModeUI(next);
    log.push('MODE', `setRenderMode(${next})`);

    if (next === 'external') startExternalLoop();
    else stopExternalLoop();
  });

  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    stopExternalLoop();
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

