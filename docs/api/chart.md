# Chart API

Source of truth: [`src/ChartGPU.ts`](../../src/ChartGPU.ts).

## `ChartGPU.create(container, options, context?)`

```ts
import { ChartGPU } from 'chartgpu';

const container = document.getElementById('chart')!;
const chart = await ChartGPU.create(container, {
  series: [{ type: 'line', data: [[0, 1], [1, 3], [2, 2]] }],
});
```

- **`container`**: mount target (ChartGPU owns a canvas inside it)
- **`options`**: configuration (see [options.md](options.md))
- **`context?`**: optional shared WebGPU `{ adapter, device, pipelineCache? }`

## Sharing GPU resources (optional)

### Shared `GPUDevice`

```ts
const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
const device = await adapter.requestDevice();
const chart1 = await ChartGPU.create(container1, opts1, { adapter, device });
const chart2 = await ChartGPU.create(container2, opts2, { adapter, device });
```

- If you **inject** `{ adapter, device }`, charts do **not** call `device.destroy()` on `dispose()` (you own the device).
- If you **don’t inject**, ChartGPU creates and destroys its own device.
- Charts created with an injected device can emit **`'deviceLost'`**; on loss, recreate device + charts.

### Pipeline cache (`PipelineCache`)

Share a cache to dedupe shader/pipeline creation across charts on the same device.

```ts
import { createPipelineCache } from 'chartgpu';

const pipelineCache = createPipelineCache(device);
await ChartGPU.create(a, optsA, { adapter, device, pipelineCache });
await ChartGPU.create(b, optsB, { adapter, device, pipelineCache });
```

- Cache is scoped to a single `GPUDevice` (mixing devices throws).

## `ChartGPUInstance`

Returned by `ChartGPU.create(...)`.

See [ChartGPU.ts](../../src/ChartGPU.ts) for the full interface and lifecycle behavior.

**Properties (essential):**

- `options: Readonly<ChartGPUOptions>`: the last user-provided options object (unresolved).
- `disposed: boolean`

**Common methods:**

- `setOption(...)`: update options and schedule a render.
- `appendData(seriesIndex, newPoints)`: streaming append for cartesian series.
  - Formats: `DataPoint[]`, `XYArraysData`, `InterleavedXYData`, `OHLCDataPoint[]`
  - Types: [`src/config/types.ts`](../../src/config/types.ts)
- `resize()`, `dispose()`
- `on(...)`, `off(...)`: events (see [interaction.md](interaction.md))
- `hitTest(e)`: pointer hit-test (coordinates + optional match)
- `setInteractionX(...)` / `setCrosshairX(...)`
- `getZoomRange()` / `setZoomRange(...)`
- `getPerformanceMetrics()` / `getPerformanceCapabilities()` / `onPerformanceUpdate(...)`
- `getRenderMode()` / `setRenderMode(...)` / `needsRender()` / `renderFrame()`

Data upload and scale/bounds derivation occur during [`createRenderCoordinator.ts`](../../src/core/createRenderCoordinator.ts) `RenderCoordinator.render()` (not during `setOption(...)` itself).

## External Render Mode

Set `renderMode: 'external'` to run ChartGPU inside your own render loop.

```ts
const chart = await ChartGPU.create(container, { renderMode: 'external', series: [...] });
function loop() {
  if (chart.needsRender()) chart.renderFrame();
  requestAnimationFrame(loop);
}
loop();
```

Example: [`examples/external-render-mode/`](../../examples/external-render-mode/).

## Chart sync (`connectCharts`)

Sync crosshair/tooltip between charts (default) and optionally sync zoom.

- Zoom sync only has effect when all connected charts have data zoom enabled.

```ts
import { connectCharts } from 'chartgpu';
const disconnect = connectCharts([chartA, chartB], { syncZoom: true });
```
