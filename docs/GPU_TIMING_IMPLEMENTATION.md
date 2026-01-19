# GPU Timing Implementation

## Overview

GPU timing has been implemented in the `examples/million-points` benchmark using `GPUDevice.queue.onSubmittedWorkDone()` to measure GPU execution time without stalling the pipeline.

## Decision: Option A (`queue.onSubmittedWorkDone()`)

**Selected Approach**: `queue.onSubmittedWorkDone()` for GPU timing

**Rationale**:
- ✅ **Minimal invasiveness**: Only adds a promise callback after `queue.submit()`
- ✅ **Cross-browser reliable**: Works everywhere WebGPU is available (no feature flags required)
- ✅ **Non-blocking**: Does not stall the GPU pipeline
- ✅ **Useful metric**: Measures end-to-end GPU completion time (submit → GPU done)

**Alternative Considered**: Timestamp queries (`timestamp-query` feature)
- ❌ Requires feature flag (not universally available)
- ❌ More complex implementation (requires query buffer management and async readback)
- ❌ More invasive (requires modifying render pass)
- ✅ Would provide true GPU pass timing (more precise)

## Implementation Details

### Location
- **File**: `examples/million-points/main.ts`
- **Key changes**: Added GPU timing tracking in `renderLoop()` function

### Code Pattern

```typescript
// CPU submit time (existing)
const t0 = performance.now();
coordinator.render();
const t1 = performance.now();
renderMs.push(t1 - t0);

// GPU execution time (new)
const device = gpuContext.device;
device.queue.onSubmittedWorkDone().then(() => {
  const gpuEnd = performance.now();
  // GPU time = time from CPU submit completion to GPU work completion
  gpuMs.push(gpuEnd - t1);
}).catch(() => {
  // Silently ignore errors (device lost, etc.)
});
```

### What It Measures

**GPU Time** (`gpuMs`):
- **Start**: When `queue.submit()` completes (CPU-side)
- **End**: When all GPU work submitted before the call has finished executing
- **Includes**: 
  - GPU command execution time
  - GPU queue latency
  - GPU-CPU synchronization overhead

**CPU Submit Time** (`renderMs`):
- **Start**: Before `coordinator.render()` call
- **End**: After `coordinator.render()` returns (includes `queue.submit()`)
- **Includes**: 
  - CPU-side render coordinator work
  - GPU command encoding
  - `queue.submit()` call (synchronous, blocks until queued)

### Performance Impact

**Minimal overhead**:
- Promise creation: ~0.001ms per frame
- Promise resolution: Async callback (doesn't block render loop)
- DOM updates: Throttled to 250ms intervals (already implemented)

**Sampling strategy**:
- GPU timing samples are collected every frame
- Rolling average computed over 60 samples (1 second at 60 FPS)
- DOM updates throttled to prevent UI jitter

### Interpreting the Stats

**FPS**: Frame rate (target: 60 FPS = 16.67ms per frame)

**CPU submit (ms)**: Time spent in `coordinator.render()` including:
- Data sampling/recomputation
- Buffer updates
- Renderer preparations
- GPU command encoding
- `queue.submit()` call

**GPU time (ms)**: Time from submit completion to GPU work completion:
- If GPU time > CPU submit time: GPU is the bottleneck
- If GPU time < CPU submit time: CPU is the bottleneck
- If GPU time ≈ frame time: GPU is fully utilized

**Example scenarios**:
- **CPU-bound**: CPU submit = 20ms, GPU time = 5ms → CPU is bottleneck
- **GPU-bound**: CPU submit = 5ms, GPU time = 20ms → GPU is bottleneck
- **Balanced**: CPU submit = 10ms, GPU time = 10ms → Both are utilized

### Cross-Browser Compatibility

**Supported browsers**:
- Chrome/Edge 113+ ✅
- Safari 18+ ✅
- Firefox (WebGPU not yet supported) ❌

**No feature flags required**: `queue.onSubmittedWorkDone()` is part of the core WebGPU API.

## Future Enhancements

### Option B: Timestamp Queries (if needed)

If more precise GPU timing is required, timestamp queries can be added:

**Required changes**:
1. Request `timestamp-query` feature during device creation
2. Create timestamp query set in render pass
3. Write timestamps at pass start/end
4. Read back query results asynchronously (next frame)
5. Calculate GPU pass duration from timestamp deltas

**Trade-offs**:
- More precise (pure GPU execution time)
- More complex (query buffer management)
- Requires feature flag (may not be available everywhere)
- More invasive (modifies render pass)

**When to use**:
- Need per-pass timing breakdown
- Need precise GPU execution time (excluding queue latency)
- Feature availability is acceptable

## References

- [WebGPU Specification: Queue](https://www.w3.org/TR/webgpu/#gpuqueue)
- [WebGPU Specification: onSubmittedWorkDone](https://www.w3.org/TR/webgpu/#dom-gpuqueue-onsubmittedworkdone)
- [WebGPU Specification: Timestamp Queries](https://www.w3.org/TR/webgpu/#timestamp-query)
