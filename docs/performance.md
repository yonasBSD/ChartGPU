# Performance Guide

Optimize ChartGPU for large datasets and real-time streaming.

## Sampling

**When:** Dataset > 5K points per series (default `samplingThreshold`), or frame rate drops.

**Defaults:** `sampling: 'lttb'`, `samplingThreshold: 5000`

**Algorithms:**

| Algorithm | Best for | Preserves |
|-----------|----------|-----------|
| `lttb` (default) | General time-series | Shape, peaks, outliers |
| `average` | Noisy data | Trends |
| `max` / `min` | Spikes | Peaks / valleys |
| `none` | Small datasets (<5K) | All points |

**Config:** Per-series `sampling`, `samplingThreshold` in [options](api/options.md#series-configuration). See [`examples/sampling/`](../examples/sampling/).

## Zoom-aware resampling

Zoom triggers resampling on visible range only. Target scales with zoom level (capped at 200K points). Debounce ~100ms.

**Y-axis bounds:** `yAxis.autoBounds: 'visible'` (default) rescales to visible data; `'global'` uses full dataset bounds.

## Streaming

**Recommended config:**
- `animation: false`
- `autoScroll: true`
- `dataZoom: [{ type: 'inside' }, { type: 'slider' }]`
- `sampling: 'lttb'`, `samplingThreshold: 2500`

**Memory:** Trim when `rawData.length > maxPoints` — `setOption({ series: [{ data: rawData.slice(-maxPoints) }] })`. See [`examples/live-streaming/`](../examples/live-streaming/).

## appendData vs setOption

| Method | Use case | GPU upload | Animation |
|--------|----------|------------|-----------|
| `appendData(index, newPoints)` | Streaming, incremental | Incremental when possible | No |
| `setOption({ series })` | Full replacement |

**appendData:** Cartesian only, append-only. **setOption:** Full data/config changes, supports animation.

## Memory & disposal

- Call `chart.dispose()` when chart is no longer needed.
- Buffer growth: geometric (power-of-two). No shrinking until disposal.
- Time axis: ChartGPU rebases epoch-ms internally for Float32 precision.

## Benchmark (1M points)

**Location:** [`examples/million-points/`](../examples/million-points/)

**Steps:** `npm run dev` → `http://localhost:5176/examples/million-points/` → Enable "Benchmark mode".

**Stats:** FPS, CPU submit time, GPU time, rendered point count. CPU > GPU time: CPU-bound; GPU > CPU: GPU-bound.

## Checklist

- [ ] Enable sampling for datasets >5K
- [ ] Use `appendData` for streaming
- [ ] Bound memory with periodic trim
- [ ] Disable animation for streaming
- [ ] Call `dispose()` when done
- [ ] Profile with DevTools

## See also

- [API Reference](api/README.md) — Sampling, zoom, lifecycle
- [Getting Started](GETTING_STARTED.md)
- [examples/sampling/](../examples/sampling/), [examples/live-streaming/](../examples/live-streaming/), [examples/million-points/](../examples/million-points/)
