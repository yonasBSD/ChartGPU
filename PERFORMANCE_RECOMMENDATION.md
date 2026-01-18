# Append Coalescing & Zoom-Aware Resampling Strategy

## Current Implementation Analysis

### Strengths
- ✅ Per-series queues (`pendingAppendByIndex`) already implemented
- ✅ Efficient GPU buffer appends via `DataStore.appendSeries()` (partial writes)
- ✅ Zoom resampling debounced (100ms) to avoid churn

### Issues
- ❌ Appends flush on every render frame (even if no appends occurred)
- ❌ Resampling happens immediately on append (even if zoom unchanged)
- ❌ Separate timers for resampling vs appends (potential double work)
- ❌ No timeout fallback for high-frequency streams (>60Hz)

## Recommended Strategy: Unified Flush Scheduler

### Core Design

**Single scheduled flush** that handles:
1. Append coalescing (per-series queues)
2. Zoom-aware resampling (only when needed)
3. GPU buffer updates (via `DataStore.appendSeries()`)

### Implementation Pattern

```typescript
// State
let flushScheduled = false;
let flushTimer: number | null = null;
let pendingResample = false;
let lastZoomRange: { start: number; end: number } | null = null;

// Unified flush scheduler
const scheduleFlush = (options?: { immediate?: boolean }): void => {
  if (flushScheduled && !options?.immediate) return;
  
  flushScheduled = true;
  
  // Cancel any pending timeout
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  
  // Primary: use rAF (60fps, ~16ms)
  const rafId = requestAnimationFrame(() => {
    flushScheduled = false;
    flushTimer = null;
    executeFlush();
  });
  
  // Fallback: timeout for high-frequency streams (>60Hz)
  // Ensures flush happens even if rAF is delayed
  flushTimer = window.setTimeout(() => {
    // Only execute if rAF hasn't fired yet
    if (flushScheduled) {
      cancelAnimationFrame(rafId);
      flushScheduled = false;
      flushTimer = null;
      executeFlush();
    }
  }, 16); // ~60fps equivalent
};

// Unified flush execution
const executeFlush = (): void => {
  const hasAppends = pendingAppendByIndex.size > 0;
  const zoomChanged = lastZoomRange !== (zoomState?.getRange() ?? null);
  
  // Only resample if:
  // 1. Zoom changed, OR
  // 2. Appends occurred AND zoom is active (not full span)
  const shouldResample = 
    pendingResample || 
    (hasAppends && zoomState && !isFullSpan(zoomState.getRange()));
  
  // Flush appends if any
  if (hasAppends) {
    flushAppends();
    pendingResample = false; // Clear resample flag after append flush
  }
  
  // Resample if needed
  if (shouldResample) {
    recomputeRenderSeries();
    pendingResample = false;
  }
  
  // Always request render after flush
  requestRender();
};

// Append data (updated)
const appendData = (seriesIndex: number, newPoints: ReadonlyArray<DataPoint>): void => {
  // ... validation ...
  
  // Queue append
  const existing = pendingAppendByIndex.get(seriesIndex);
  if (existing) {
    existing.push(...newPoints);
  } else {
    pendingAppendByIndex.set(seriesIndex, Array.from(newPoints));
  }
  
  // Schedule unified flush (replaces requestRender())
  scheduleFlush();
};

// Zoom change handler (updated)
const onZoomChange = (range: Readonly<{ start: number; end: number }>): void => {
  const currentRange = zoomState?.getRange() ?? null;
  const changed = 
    !lastZoomRange || 
    lastZoomRange.start !== currentRange?.start || 
    lastZoomRange.end !== currentRange?.end;
  
  if (changed) {
    lastZoomRange = currentRange ? { ...currentRange } : null;
    pendingResample = true;
    
    // Debounce resampling for rapid zoom changes (wheel/drag)
    if (resampleTimer !== null) {
      clearTimeout(resampleTimer);
    }
    resampleTimer = window.setTimeout(() => {
      resampleTimer = null;
      scheduleFlush();
    }, 100);
  }
  
  requestRender(); // Still need immediate render for zoom UI feedback
};
```

### Key Optimizations

1. **Single Flush Path**
   - One scheduler handles both appends and resampling
   - Eliminates redundant `recomputeRenderSeries()` calls
   - Reduces CPU work by batching operations

2. **rAF-First with Timeout Fallback**
   - Primary: `requestAnimationFrame()` (syncs with display refresh)
   - Fallback: 16ms timeout for streams >60Hz
   - Ensures responsive UX without excessive flushing

3. **Zoom-Aware Resampling**
   - Only resample when:
     - Zoom window changed (debounced 100ms for wheel/drag)
     - Appends occurred AND zoom is active (not full span)
   - Avoids resampling on every append when zoomed out

4. **Minimal Overhead**
   - `flushScheduled` flag prevents duplicate scheduling
   - Timeout cleanup prevents memory leaks
   - Batch operations reduce function call overhead

### Performance Characteristics

**Low-frequency streams (<60Hz):**
- Flush aligns with rAF (~16ms)
- Smooth 60fps rendering
- Minimal CPU overhead

**High-frequency streams (>60Hz):**
- Timeout ensures flush within 16ms
- Batches multiple appends per flush
- Maintains responsiveness

**Zoom interactions:**
- Resampling debounced 100ms (prevents churn during wheel/drag)
- Immediate render for UI feedback
- Resample happens on next flush

**Memory efficiency:**
- Per-series queues prevent data duplication
- GPU partial writes minimize bandwidth
- Single flush reduces intermediate allocations

### Migration Path

1. **Phase 1**: Add unified scheduler alongside existing code
2. **Phase 2**: Update `appendData()` to use `scheduleFlush()`
3. **Phase 3**: Update zoom handlers to use unified scheduler
4. **Phase 4**: Remove old `flushPendingAppendsIfNeeded()` from `render()`
5. **Phase 5**: Remove separate `scheduleResampleFromZoom()`

### Testing Considerations

- **High-frequency streams**: Test with 100Hz+ append rates
- **Zoom interactions**: Test rapid wheel/drag zoom changes
- **Mixed workloads**: Test appends during active zoom
- **Memory**: Monitor for timer leaks or excessive allocations
- **Frame timing**: Verify flush aligns with rAF in normal cases

### Edge Cases

- **Disposal**: Cancel all timers and rAF on dispose
- **Rapid append+zoom**: Unified flush handles both atomically
- **Zoom disabled**: Skip resampling logic entirely
- **Empty appends**: Early return if no work needed
