# ChartGPU Performance Benchmark

The **grand finale** demo - a hardcore benchmark showcasing ChartGPU's performance capabilities with exact FPS measurement and unlimited configurability.

## Overview

This example demonstrates ChartGPU's performance at scale with:
- **Exact FPS measurement** using the performance API (`getPerformanceMetrics()`, `onPerformanceUpdate()`)
- **Worker vs Main thread comparison** - toggle between rendering modes
- **Unlimited configuration** - no artificial caps on data input
- **Real-time metrics** - frame times, memory, drops, quality indicators
- **Frame time visualization** - mini canvas graph showing last 120 frames
- **Beautiful glassmorphism UI** - modern dark theme with smooth animations

## Features

### 🎯 Exact FPS Measurement
- **Real FPS calculation** using circular frame timestamp buffer
- **Color-coded display**: Green (>55fps), Orange (30-55fps), Red (<30fps)
- **Frame time statistics**: Min, Avg, Max, P95, P99
- **Live updates** via `onPerformanceUpdate()` callback

### ⚡ Worker Thread Support
- **Zero-copy transfers** using `packDataPoints()` and ArrayBuffer transfer
- **Main thread remains responsive** during intensive rendering
- **Side-by-side comparison** between worker and main thread modes

### 🔧 Unlimited Configurability
- **No artificial limits** - enter billions of points if your system can handle it
- **Multiple data types**: Line, Scatter, Bar, Candlestick
- **Multiple series support** (1-20 series)
- **Streaming mode** with configurable rate and duration

### 🔍 Interactive Zoom & Pan
- **Inside zoom**: Scroll to zoom in/out (centered on cursor position)
- **Pan gesture**: Shift+drag or middle-mouse drag to pan left/right
- **Zoom slider**: Visual data range selector at bottom of chart
- **Works smoothly** with millions of points in both render modes

### 📊 Comprehensive Metrics
- **FPS**: Exact frames per second with quality indicator
- **Frame Times**: Min/Avg/Max/P95/P99 in milliseconds
- **Memory**: Used and peak memory consumption
- **Frame Drops**: Total and consecutive drop counts
- **Visual Graph**: Real-time frame time visualization

### 🚨 Emergency Stop
- **Big red button** that forcefully stops all operations
- **Safe cleanup** of GPU resources and worker threads
- **Always available** for when things go wrong

## Usage

### Basic Benchmark

1. **Configure parameters**:
   - Point Count: 1,000,000 (default)
   - Series Count: 1
   - Data Type: Line
   - Render Mode: Worker Thread

2. **Click "Generate"** to create the dataset
   - Shows progress during generation
   - Creates chart after data is ready
   - Begins tracking FPS immediately

3. **Observe metrics**:
   - Watch FPS display (color-coded)
   - Monitor frame time graph
   - Check memory usage
   - Track frame drops

4. **Interact with the chart**:
   - **Scroll to zoom**: Mouse wheel over the chart to zoom in/out (centered on cursor)
   - **Drag to pan**: Shift+drag or middle-mouse drag to pan left/right
   - **Zoom slider**: Use the slider at the bottom to select a specific data range

### Streaming Benchmark

1. **Generate initial dataset** (or start with empty)

2. **Configure streaming**:
   - Points per Frame: 10,000
   - Duration: 100 frames

3. **Click "Start Streaming"**
   - Appends data in real-time
   - Uses zero-copy transfer (worker mode)
   - Updates metrics continuously

### Mode Comparison

**Test Worker vs Main Thread:**

1. Generate 1M points with **Worker Thread** mode
   - Note FPS and frame times
   - Interact with browser (scroll, click tabs)
   - Main thread should remain responsive

2. Click "Clear" and switch to **Main Thread** mode

3. Generate 1M points again
   - Compare FPS metrics
   - Try interacting - may feel sluggish
   - Main thread is blocked during rendering

### Stress Testing

**Push the limits:**

1. Set Point Count to **10,000,000** (10 million)
2. Use Worker Thread mode
3. Generate and watch the metrics
4. Note where performance starts degrading

**Go hardcore:**

1. Set Point Count to **100,000,000** (100 million)
2. System warnings will appear
3. Watch memory usage carefully
4. Be ready to hit "Emergency Stop"

**Billion points (if you dare):**

1. Set Point Count to **1,000,000,000** (1 billion)
2. Expect long generation time
3. May exhaust system memory
4. Browser might crash - save other work first!

## Performance Metrics Explained

### Exact FPS
Calculated from circular buffer of last 120 frame timestamps using formula:
```
avgFrameTime = totalDelta / (frameCount - 1)
fps = 1000 / avgFrameTime
```

**Quality Indicators:**
- **Smooth (Green)**: >55 FPS - Excellent performance
- **Medium (Orange)**: 30-55 FPS - Acceptable, may feel slightly sluggish
- **Choppy (Red)**: <30 FPS - Poor performance, needs optimization

### Frame Time Stats
- **Min**: Fastest frame in buffer
- **Avg**: Average frame time (inversely related to FPS)
- **Max**: Slowest frame in buffer
- **P95**: 95th percentile - 95% of frames are faster than this
- **P99**: 99th percentile - 99% of frames are faster than this

**Target**: 16.67ms average for 60 FPS

### Frame Drops
A frame is "dropped" when frame time exceeds 1.5× expected (>25ms at 60fps target).

- **Total Drops**: Cumulative since start
- **Consecutive Drops**: Current streak of dropped frames
  - High consecutive drops indicate sustained performance issue

### Frame Time Graph
Real-time visualization of last 120 frames:
- **Green bars**: Good frames (<16.67ms)
- **Yellow bars**: Slow frames (16.67-33ms)
- **Red bars**: Dropped frames (>33ms)
- **Dashed line**: 60fps target (16.67ms)

## Technical Details

### Zero-Copy Data Transfer (Worker Mode)
Uses `packDataPoints()` and `packOHLCDataPoints()` to pack data into Float32Array, then transfers the underlying ArrayBuffer to worker:

```typescript
const packed = packDataPoints(dataPoints);
chart.appendData(seriesIndex, packed, 'xy');
// packed is now detached - buffer transferred to worker
```

**Benefits:**
- No serialization overhead
- No memory duplication
- Instant transfer (ownership moves, not copied)

### GPU Timing
Worker mode supports GPU timing (if `timestamp-query` feature available):
- **CPU Time**: Main thread + worker thread CPU work
- **GPU Time**: Actual GPU shader execution time
- Helps identify CPU vs GPU bottlenecks

### Memory Management
- **LTTB Sampling**: Keeps GPU buffer size constant after 5,000 points
- **Streaming**: ArrayBuffers transferred (not accumulated)
- **Cleanup**: `dispose()` frees all GPU resources

## Performance Tips

### For Best Results

1. **Use Worker Thread mode** for large datasets (>10K points)
2. **Close other tabs/apps** to free GPU and memory
3. **Use Chrome/Edge 113+** for best WebGPU performance
4. **Disable animations** (already disabled in this benchmark)
5. **Enable hardware acceleration** in browser settings

### Troubleshooting

**Low FPS (<30):**
- Reduce point count
- Switch to worker thread mode
- Enable LTTB sampling (enabled by default)
- Check GPU isn't throttling (thermal issues)

**Browser crashes:**
- Reduce point count below 100M
- Ensure sufficient RAM (8GB+ recommended)
- Check console for memory warnings
- Use Emergency Stop if generation hangs

**Worker initialization fails:**
- Check browser supports OffscreenCanvas
- Verify WebGPU is available
- Try main thread mode as fallback

### Browser Memory Limits

| Browser | Typical Limit | Max Practical Points |
|---------|---------------|---------------------|
| Chrome | 4GB per tab | ~500M (1GB data) |
| Edge | 4GB per tab | ~500M (1GB data) |
| Safari | 2GB per tab | ~250M (500MB data) |
| Firefox | No WebGPU yet | N/A |

**Note**: These are approximate. Actual limits depend on system RAM and other processes.

## Warnings and Limitations

### System Warnings

The benchmark will warn you when:
- Point count exceeds 100M (significant memory)
- Point count exceeds 1B (may crash browser)
- Memory allocation may fail
- Performance degradation detected

### Known Limitations

1. **Browser tab memory limits** (~4GB in Chrome/Edge)
2. **GPU texture size limits** (typically 16384×16384)
3. **ArrayBuffer size limits** (2GB per buffer in most browsers)
4. **JavaScript heap limits** (varies by browser and system)

### Emergency Stop

The emergency stop button will:
1. ✅ Stop all streaming operations
2. ✅ Dispose GPU contexts and free memory
3. ✅ Clear all metrics and state
4. ✅ Terminate workers (worker mode)
5. ❌ Cannot recover crashed browser tab

**Use when:**
- Generation seems stuck
- Memory usage spiraling
- Browser becoming unresponsive
- Need to abort immediately

## Architecture

### Component Hierarchy
```
BenchmarkController
├── ChartGPUInstance (worker or main thread)
│   ├── GPUContext (WebGPU device/adapter)
│   ├── RenderCoordinator (render loop)
│   └── PerformanceTracker (metrics collection)
├── FrameTimeGraph (canvas visualization)
└── UIController (DOM manipulation)
```

### Data Flow
```
User Input → Data Generation → Pack to Float32Array → Transfer to Chart
                                                          ↓
Chart renders → Emit performance metrics → Update UI displays
```

### Performance API
```typescript
// Get current metrics (synchronous)
const metrics = chart.getPerformanceMetrics();

// Subscribe to updates (every frame)
const unsubscribe = chart.onPerformanceUpdate((metrics) => {
  updateUI(metrics);
});

// Check capabilities
const capabilities = chart.getPerformanceCapabilities();
if (capabilities.gpuTimingSupported) {
  // Enable GPU timing
}
```

## Comparison with Other Libraries

| Feature | ChartGPU | Chart.js | ECharts | Plotly |
|---------|----------|----------|---------|--------|
| Max Points (60fps) | 5M+ | ~10K | ~100K | ~50K |
| Worker Support | ✅ Native | ❌ | ❌ | ❌ |
| Exact FPS API | ✅ | ❌ | ❌ | ❌ |
| Zero-Copy Transfer | ✅ | ❌ | ❌ | ❌ |
| GPU Acceleration | ✅ WebGPU | ❌ | ❌ | ❌ |

**ChartGPU advantages:**
- 100-500× more points at same FPS
- Main thread stays responsive (worker mode)
- Exact performance measurement built-in
- Designed for real-time streaming

## Related Examples

- **`worker-streaming`** - High-performance streaming with Float32Array (deprecated, superseded by this example)
- **`worker-convenience`** - API comparison (deprecated, superseded by this example)
- **`live-streaming`** - Real-time append with autoScroll
- **`million-points`** - 1M point benchmark (main thread only)
- **`sampling`** - Zoom-aware LTTB sampling

## Source Files

- **`index.html`** - Page structure
- **`styles.css`** - Glassmorphism theme and responsive layout
- **`main.ts`** - Benchmark logic, data generation, metrics tracking
- **`README.md`** - This file

## License

Same as ChartGPU - MIT License

## Contributing

Found a performance issue or have optimization ideas? Please open an issue or PR on the main ChartGPU repository.
