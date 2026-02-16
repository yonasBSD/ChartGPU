# Internal modules (Contributor notes)

This document is intentionally **short**. It’s a map to the internal modules that implement ChartGPU behavior, plus a few contracts that are easy to break.

## Where to start

- **Render orchestration**: [`createRenderCoordinator.ts`](../../src/core/createRenderCoordinator.ts)
- **Options resolution**: [`OptionResolver.ts`](../../src/config/OptionResolver.ts)
- **Public wrapper**: [`ChartGPU.ts`](../../src/ChartGPU.ts)

## Data pipeline (internal)

- **Data store + GPU uploads**: [`createDataStore.ts`](../../src/data/createDataStore.ts)
- **Streaming GPU buffers** (double-buffered): [`createStreamBuffer.ts`](../../src/data/createStreamBuffer.ts)
- **CPU downsampling (LTTB helper)**: [`lttbSample.ts`](../../src/data/lttbSample.ts)

## Interaction (internal)

Interaction code lives under [`src/interaction/`](../../src/interaction/).

- **Event normalization**: [`createEventManager.ts`](../../src/interaction/createEventManager.ts)
  - `payload.x/y`: canvas-local **CSS px**
  - `payload.gridX/gridY`: plot/grid-local **CSS px**
- **Zoom state + inside gestures**: [`createZoomState.ts`](../../src/interaction/createZoomState.ts), [`createInsideZoom.ts`](../../src/interaction/createInsideZoom.ts)
- **Hit-testing**: [`findNearestPoint.ts`](../../src/interaction/findNearestPoint.ts), [`findPointsAtX.ts`](../../src/interaction/findPointsAtX.ts), [`findPieSlice.ts`](../../src/interaction/findPieSlice.ts)

Contracts worth keeping in mind:

- **Visibility**: most helpers ignore `series.visible === false`.
- **Index mapping**: if you filter series, preserve original indices in results.
- **Sorted-x** (cartesian): several fast paths assume increasing x.
- **Units must match**: if a helper expects range-space inputs, your scales must output the same space.

## DOM overlays (internal)

- **Text overlay**: [`createTextOverlay.ts`](../../src/components/createTextOverlay.ts)
- **Legend**: [`createLegend.ts`](../../src/components/createLegend.ts)
- **Tooltip**: [`createTooltip.ts`](../../src/components/createTooltip.ts)
  - Tooltip content is assigned via `innerHTML` (only pass trusted/sanitized strings).
- **DataZoom slider**: [`createDataZoomSlider.ts`](../../src/components/createDataZoomSlider.ts)

## Render coordinator (internal)

- **Factory**: [`createRenderCoordinator.ts`](../../src/core/createRenderCoordinator.ts)
- **Decomposed modules**: [`src/core/renderCoordinator/`](../../src/core/renderCoordinator/)

The coordinator computes layout/scales, prepares renderers, uploads data, and emits DOM overlays.

## Renderer map (internal)

Renderer factories live under [`src/renderers/`](../../src/renderers/).

| Feature | Factory | Shader(s) |
|---|---|---|
| Line | [`createLineRenderer.ts`](../../src/renderers/createLineRenderer.ts) | [`line.wgsl`](../../src/shaders/line.wgsl) |
| Area | [`createAreaRenderer.ts`](../../src/renderers/createAreaRenderer.ts) | [`area.wgsl`](../../src/shaders/area.wgsl) |
| Bar | [`createBarRenderer.ts`](../../src/renderers/createBarRenderer.ts) | [`bar.wgsl`](../../src/shaders/bar.wgsl) |
| Scatter | [`createScatterRenderer.ts`](../../src/renderers/createScatterRenderer.ts) | [`scatter.wgsl`](../../src/shaders/scatter.wgsl) |
| Scatter density | [`createScatterDensityRenderer.ts`](../../src/renderers/createScatterDensityRenderer.ts) | [`scatterDensityBinning.wgsl`](../../src/shaders/scatterDensityBinning.wgsl), [`scatterDensityColormap.wgsl`](../../src/shaders/scatterDensityColormap.wgsl) |
| Pie | [`createPieRenderer.ts`](../../src/renderers/createPieRenderer.ts) | [`pie.wgsl`](../../src/shaders/pie.wgsl) |
| Candlestick | [`createCandlestickRenderer.ts`](../../src/renderers/createCandlestickRenderer.ts) | [`candlestick.wgsl`](../../src/shaders/candlestick.wgsl) |
| Grid lines | [`createGridRenderer.ts`](../../src/renderers/createGridRenderer.ts) | [`grid.wgsl`](../../src/shaders/grid.wgsl) |
| Axis baseline + ticks | [`createAxisRenderer.ts`](../../src/renderers/createAxisRenderer.ts) | [`grid.wgsl`](../../src/shaders/grid.wgsl) *(shared)* |
| Crosshair | [`createCrosshairRenderer.ts`](../../src/renderers/createCrosshairRenderer.ts) | [`crosshair.wgsl`](../../src/shaders/crosshair.wgsl) |
| Hover highlight | [`createHighlightRenderer.ts`](../../src/renderers/createHighlightRenderer.ts) | [`highlight.wgsl`](../../src/shaders/highlight.wgsl) |

Notes:

- **Grid lines**: driven by resolved options (`ResolvedChartGPUOptions.gridLines`) and wired in [`renderOverlays.ts`](../../src/core/renderCoordinator/render/renderOverlays.ts).
- **WGSL imports**: renderers may import WGSL via Vite `?raw` (types in [`wgsl-raw.d.ts`](../../src/wgsl-raw.d.ts)).

## WebGPU contracts

- `queue.writeBuffer(...)` offsets/sizes must be **4-byte aligned**.
- Uniform buffers are typically **16-byte aligned**.
- Pipeline target formats must match the render pass attachment format.
