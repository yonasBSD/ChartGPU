# Implementation Notes: appendData API, autoScroll, and Coordinator Ownership

## Overview

This document provides implementation notes for:
1. **appendData API**: Runtime streaming data append for cartesian series
2. **autoScroll option**: Automatic zoom window adjustment during streaming
3. **Render coordinator ownership**: Coordinator as single source of truth for `rawData`/`rawBounds`
4. **Zoom semantics**: Percent-space zoom window [0, 100] applied to x-domain

## Key Architectural Principles

### Functional-First Pattern
- **Prefer readonly state interfaces** over mutable classes
- **Functions return new state objects** rather than mutating input
- **Coordinator owns mutable runtime state** internally (functional wrapper pattern)
- **Public APIs expose readonly views** of coordinator state

### Ownership Model
- **OptionResolver**: Produces readonly `rawData`/`rawBounds` snapshots in resolved series types
- **RenderCoordinator**: Owns mutable `runtimeRawDataByIndex`/`runtimeRawBoundsByIndex` arrays
- **ChartGPU**: Should query coordinator for runtime data (no duplicate ownership)

---

## File-by-File Implementation Notes

### `src/config/types.ts`

#### Current State
- `ChartGPUOptions.autoScroll?: boolean` - already defined
- `DataPoint` union type - already supports tuple/object forms

#### Type Pitfalls & Recommendations

**1. `autoScroll` Type Safety**
```typescript
// ✅ GOOD: Already correct
readonly autoScroll?: boolean;

// ⚠️ AVOID: Don't make it required or add complex validation here
// Keep it simple - runtime validation happens in OptionResolver
```

**2. `DataPoint` Immutability**
```typescript
// ✅ GOOD: Current readonly union is correct
export type DataPoint = DataPointTuple | Readonly<{ x: number; y: number; size?: number }>;

// ⚠️ PITFALL: Don't allow mutable object forms
// The readonly wrapper ensures immutability at the type level
```

**3. No Changes Needed**
- `autoScroll` is already optional boolean (correct)
- `DataPoint` types are already readonly (correct)
- Series config types don't need runtime ownership markers (coordinator handles that)

---

### `src/config/defaults.ts`

#### Current State
```typescript
export const defaultOptions = {
  // ...
  autoScroll: false,
  // ...
} as const satisfies Readonly<...>;
```

#### Implementation Notes

**1. Default Value**
```typescript
// ✅ GOOD: Current default is correct
autoScroll: false,

// Rationale: Auto-scroll is opt-in behavior that requires:
// - dataZoom enabled (zoom window exists)
// - xAxis.min/max not set (auto-bounds mode)
// Defaulting to false avoids surprising behavior
```

**2. Type Safety**
```typescript
// ✅ GOOD: `as const satisfies` ensures type safety
// ⚠️ AVOID: Don't change the default to true
// ⚠️ AVOID: Don't add conditional defaults based on other options
```

**3. No Changes Needed**
- Default value is correct
- Type assertion is safe and preserves immutability

---

### `src/config/OptionResolver.ts`

#### Current State
- Resolved series types include `rawData: Readonly<...>` and `rawBounds?: RawBounds`
- `resolveOptions()` computes `rawBounds` from input data
- `rawData` is set to input `data` (before sampling)

#### Type Pitfalls & Recommendations

**1. Resolved Series `rawData`/`rawBounds` Semantics**

**Current Pattern (✅ GOOD):**
```typescript
export type ResolvedLineSeriesConfig = Readonly<{
  // ...
  readonly rawData: Readonly<LineSeriesConfig['data']>;
  readonly data: Readonly<LineSeriesConfig['data']>;
  readonly rawBounds?: RawBounds;
}>;
```

**Key Insight:**
- `rawData`/`rawBounds` in resolved types are **snapshots at resolution time**
- They represent the **initial state** before any runtime appends
- Coordinator will own **mutable runtime copies** internally
- Resolved types remain readonly (functional pattern)

**2. Runtime Ownership Transition**

**Current Flow:**
1. `resolveOptions()` produces resolved series with `rawData`/`rawBounds` snapshots
2. Coordinator's `initRuntimeSeriesFromOptions()` copies into mutable arrays
3. Coordinator owns `runtimeRawDataByIndex`/`runtimeRawBoundsByIndex`

**✅ GOOD Pattern:**
```typescript
// In OptionResolver: readonly snapshot
const resolved = {
  rawData: inputData,  // readonly snapshot
  rawBounds: computeRawBoundsFromData(inputData),
  // ...
};

// In Coordinator: mutable runtime copy
const runtimeRawDataByIndex[i] = resolved.rawData.slice();  // mutable copy
const runtimeRawBoundsByIndex[i] = resolved.rawBounds ?? computeRawBoundsFromData(runtimeRawDataByIndex[i]);
```

**3. `rawBounds` Optionality**

**Current Pattern:**
```typescript
readonly rawBounds?: RawBounds;
```

**Rationale:**
- `rawBounds` is optional because:
  - Empty data arrays have no bounds
  - Non-finite data may fail bounds computation
  - Coordinator can compute on-demand if missing

**⚠️ PITFALL: Don't make `rawBounds` required**
- Empty series would require sentinel values
- Non-finite data handling becomes complex
- Optional allows graceful fallback to on-demand computation

**4. `autoScroll` Resolution**

**Current Pattern:**
```typescript
const autoScrollRaw = (userOptions as unknown as { readonly autoScroll?: unknown }).autoScroll;
const autoScroll = typeof autoScrollRaw === 'boolean' ? autoScrollRaw : defaultOptions.autoScroll;
```

**✅ GOOD: Runtime type guard**
- Handles JS callers (non-TypeScript)
- Falls back to default
- No changes needed

**5. No Changes Needed**
- Resolved types correctly use readonly snapshots
- `rawBounds` optionality is correct
- `autoScroll` resolution is safe

---

### `src/core/createRenderCoordinator.ts`

#### Current State
- Coordinator owns `runtimeRawDataByIndex: Array<DataPoint[] | null>`
- Coordinator owns `runtimeRawBoundsByIndex: Array<Bounds | null>`
- `appendData()` coalesces appends, flushes in `render()`
- `flushPendingAppendsIfNeeded()` handles auto-scroll logic

#### Implementation Notes

**1. Coordinator Ownership Pattern**

**Current Implementation (✅ GOOD):**
```typescript
// Coordinator-owned mutable arrays
let runtimeRawDataByIndex: Array<DataPoint[] | null> = new Array(options.series.length).fill(null);
let runtimeRawBoundsByIndex: Array<Bounds | null> = new Array(options.series.length).fill(null);

// Initialization from resolved options
const initRuntimeSeriesFromOptions = (): void => {
  for (let i = 0; i < count; i++) {
    const s = currentOptions.series[i]!;
    if (s.type === 'pie') continue;
    
    const raw = (s.rawData ?? s.data) as ReadonlyArray<DataPoint>;
    const owned = raw.length === 0 ? [] : raw.slice();  // mutable copy
    runtimeRawDataByIndex[i] = owned;
    runtimeRawBoundsByIndex[i] = s.rawBounds ?? computeRawBoundsFromData(owned);
  }
};
```

**Key Principles:**
- Coordinator **owns** mutable runtime data
- Initialization **copies** from resolved options (snapshot)
- Subsequent appends **mutate** coordinator-owned arrays
- Bounds are **incrementally updated** (not recomputed from scratch)

**2. `appendData()` Coalescing Pattern**

**Current Implementation (✅ GOOD):**
```typescript
const appendData: RenderCoordinator['appendData'] = (seriesIndex, newPoints) => {
  // Validation...
  
  const existing = pendingAppendByIndex.get(seriesIndex);
  if (existing) {
    existing.push(...newPoints);  // coalesce
  } else {
    pendingAppendByIndex.set(seriesIndex, Array.from(newPoints));  // new staging array
  }
  
  requestRender();  // schedule flush
};
```

**Rationale:**
- Coalescing reduces allocations for rapid appends
- Flush happens once per render frame
- Staging arrays are mutable (functional wrapper pattern)

**3. `flushPendingAppendsIfNeeded()` Auto-Scroll Logic**

**Current Implementation (✅ GOOD):**
```typescript
const flushPendingAppendsIfNeeded = (): void => {
  // ...
  
  const canAutoScroll =
    currentOptions.autoScroll === true &&
    zoomState != null &&
    currentOptions.xAxis.min == null &&
    currentOptions.xAxis.max == null;
  
  // Capture pre-append visible domain
  const prevBaseXDomain = computeBaseXDomain(currentOptions, runtimeRawBoundsByIndex);
  const prevVisibleXDomain = zoomRange ? computeVisibleXDomain(prevBaseXDomain, zoomRange) : null;
  
  // Append points and update bounds
  for (const [seriesIndex, points] of pendingAppendByIndex) {
    // ... append logic ...
    raw.push(...points);
    runtimeRawBoundsByIndex[seriesIndex] = extendBoundsWithDataPoints(
      runtimeRawBoundsByIndex[seriesIndex],
      points
    );
  }
  
  // Auto-scroll logic
  if (canAutoScroll && zoomRange && prevVisibleXDomain) {
    const r = zoomRange;
    if (r.end >= 99.5) {
      // Pinned-to-end: preserve span, keep end at 100
      const span = r.end - r.start;
      zoomState!.setRange(100 - span, 100);
    } else {
      // Panned-away: preserve visible domain
      const nextBaseXDomain = computeBaseXDomain(currentOptions, runtimeRawBoundsByIndex);
      const span = nextBaseXDomain.max - nextBaseXDomain.min;
      if (Number.isFinite(span) && span > 0) {
        const nextStart = ((prevVisibleXDomain.min - nextBaseXDomain.min) / span) * 100;
        const nextEnd = ((prevVisibleXDomain.max - nextBaseXDomain.min) / span) * 100;
        zoomState!.setRange(nextStart, nextEnd);
      }
    }
  }
};
```

**Key Behaviors:**
- **Pinned-to-end** (`end >= 99.5`): Preserves window span, keeps `end` at 100
- **Panned-away** (`end < 99.5`): Preserves visible domain in data-space
- **Conditions**: Requires `autoScroll === true`, zoom enabled, no explicit x-axis bounds

**4. Bounds Computation Priority**

**Current Pattern (✅ GOOD):**
```typescript
const computeGlobalBounds = (
  series: ResolvedChartGPUOptions['series'],
  runtimeRawBoundsByIndex?: ReadonlyArray<Bounds | null> | null
): Bounds => {
  // ...
  
  // Priority 1: Runtime bounds (coordinator-owned, includes appends)
  const runtimeBoundsCandidate = runtimeRawBoundsByIndex?.[s] ?? null;
  if (runtimeBoundsCandidate) {
    // Use runtime bounds
    continue;
  }
  
  // Priority 2: Resolved bounds (snapshot from resolver)
  const rawBoundsCandidate = seriesConfig.rawBounds;
  if (rawBoundsCandidate) {
    // Use resolved bounds
    continue;
  }
  
  // Priority 3: Fallback to O(n) scan of sampled data
  // ...
};
```

**Rationale:**
- Runtime bounds (includes appends) take precedence
- Resolved bounds (snapshot) are fallback
- O(n) scan is last resort (should be rare)

**5. Type Safety for Runtime Arrays**

**Current Pattern:**
```typescript
let runtimeRawDataByIndex: Array<DataPoint[] | null>;
let runtimeRawBoundsByIndex: Array<Bounds | null>;
```

**✅ GOOD:**
- `null` indicates series not initialized (defensive)
- Mutable arrays are internal (not exposed in public API)
- Coordinator methods return readonly views when needed

**6. No Changes Needed**
- Ownership pattern is correct
- Auto-scroll logic is correct
- Bounds computation priority is correct
- Type safety is adequate

---

### `src/ChartGPU.ts`

#### Current State
- ChartGPU maintains **duplicate** `runtimeRawDataByIndex`/`runtimeRawBoundsByIndex` for hit-testing
- `appendData()` forwards to coordinator, then updates ChartGPU's own arrays
- Hit-testing uses ChartGPU's arrays instead of coordinator's

#### Problem: Data Duplication

**Current Pattern (⚠️ PROBLEM):**
```typescript
// ChartGPU maintains its own copy
let runtimeRawDataByIndex: DataPoint[][] = new Array(resolvedOptions.series.length).fill(null).map(() => []);
let runtimeRawBoundsByIndex: Array<Bounds | null> = new Array(resolvedOptions.series.length).fill(null);

appendData(seriesIndex, newPoints) {
  // Forward to coordinator
  coordinator?.appendData(seriesIndex, newPoints);
  
  // Then update ChartGPU's own copy (duplication!)
  const owned = runtimeRawDataByIndex[seriesIndex] ?? [];
  owned.push(...newPoints);
  runtimeRawDataByIndex[seriesIndex] = owned;
  runtimeRawBoundsByIndex[seriesIndex] = extendBoundsWithDataPoints(
    runtimeRawBoundsByIndex[seriesIndex],
    newPoints
  );
}
```

#### Solution: Query Coordinator Instead

**Recommended Pattern (✅ GOOD):**
```typescript
// Remove ChartGPU's own arrays
// Instead, add coordinator methods to query runtime data:

interface RenderCoordinator {
  // ... existing methods ...
  
  /**
   * Gets the current runtime raw data for a series (includes appends).
   * Returns readonly view of coordinator-owned mutable array.
   */
  getRuntimeRawData(seriesIndex: number): ReadonlyArray<DataPoint> | null;
  
  /**
   * Gets the current runtime raw bounds for a series (includes appends).
   */
  getRuntimeRawBounds(seriesIndex: number): RawBounds | null;
  
  /**
   * Gets runtime series configs with coordinator-owned rawData/rawBounds.
   * Used for hit-testing that needs latest appends.
   */
  getRuntimeSeriesForHitTest(): ReadonlyArray<ResolvedSeriesConfig>;
}
```

**ChartGPU Changes:**
```typescript
// Remove duplicate arrays
// let runtimeRawDataByIndex: DataPoint[][] = ...;  // REMOVE
// let runtimeRawBoundsByIndex: Array<Bounds | null> = ...;  // REMOVE

appendData(seriesIndex, newPoints) {
  // Forward to coordinator (coordinator owns the data)
  coordinator?.appendData(seriesIndex, newPoints);
  
  // Invalidate hit-test cache (coordinator owns the data now)
  runtimeHitTestSeriesCache = null;
  runtimeHitTestSeriesVersion++;
  interactionScalesCache = null;
  
  requestRender();
}

const getRuntimeHitTestSeries = (): ResolvedChartGPUOptions['series'] => {
  if (runtimeHitTestSeriesCache) return runtimeHitTestSeriesCache;
  
  // Query coordinator for runtime data
  runtimeHitTestSeriesCache = resolvedOptions.series.map((s, i) => {
    if (s.type === 'pie') return s;
    
    // Get runtime data from coordinator
    const runtimeRaw = coordinator?.getRuntimeRawData(i) ?? null;
    const runtimeBounds = coordinator?.getRuntimeRawBounds(i) ?? null;
    
    return {
      ...s,
      data: runtimeRaw ?? (s.data as ReadonlyArray<DataPoint>),
      rawData: runtimeRaw ?? s.rawData,
      rawBounds: runtimeBounds ?? s.rawBounds,
    };
  }) as ResolvedChartGPUOptions['series'];
  
  return runtimeHitTestSeriesCache;
};
```

**Benefits:**
- **Single source of truth**: Coordinator owns runtime data
- **No duplication**: ChartGPU queries coordinator
- **Consistency**: Hit-testing uses same data as rendering
- **Functional pattern**: Coordinator exposes readonly views

**7. Minimal-Risk Migration Path**

**Step 1: Add coordinator query methods**
```typescript
// In createRenderCoordinator.ts
const getRuntimeRawData: RenderCoordinator['getRuntimeRawData'] = (seriesIndex) => {
  assertNotDisposed();
  if (seriesIndex < 0 || seriesIndex >= currentOptions.series.length) return null;
  return runtimeRawDataByIndex[seriesIndex] ?? null;
};

const getRuntimeRawBounds: RenderCoordinator['getRuntimeRawBounds'] = (seriesIndex) => {
  assertNotDisposed();
  if (seriesIndex < 0 || seriesIndex >= currentOptions.series.length) return null;
  return runtimeRawBoundsByIndex[seriesIndex] ?? null;
};

const getRuntimeSeriesForHitTest: RenderCoordinator['getRuntimeSeriesForHitTest'] = () => {
  assertNotDisposed();
  return runtimeBaseSeries.map((s, i) => {
    if (s.type === 'pie') return s;
    const runtimeRaw = runtimeRawDataByIndex[i] ?? null;
    const runtimeBounds = runtimeRawBoundsByIndex[i] ?? null;
    return {
      ...s,
      rawData: runtimeRaw ?? s.rawData,
      rawBounds: runtimeBounds ?? s.rawBounds,
      data: runtimeRaw ?? s.data,
    };
  });
};
```

**Step 2: Update ChartGPU to use coordinator**
```typescript
// Remove duplicate arrays initialization
// Update appendData to not maintain own copy
// Update getRuntimeHitTestSeries to query coordinator
```

**Step 3: Test hit-testing**
- Verify hit-testing still works with coordinator-owned data
- Verify appends are reflected in hit-testing immediately

**8. Type Safety Considerations**

**Coordinator Return Types:**
```typescript
getRuntimeRawData(seriesIndex: number): ReadonlyArray<DataPoint> | null;
getRuntimeRawBounds(seriesIndex: number): RawBounds | null;
```

**Rationale:**
- Return `ReadonlyArray` to prevent external mutation
- Return `null` for invalid indices or uninitialized series
- Coordinator internally mutates, but exposes readonly views

---

## Type Pitfalls Summary

### 1. **Mutable vs Readonly Semantics**
- ✅ **GOOD**: Resolved types use `readonly rawData: Readonly<...>`
- ✅ **GOOD**: Coordinator owns mutable arrays internally
- ⚠️ **PITFALL**: Don't expose mutable arrays in public API
- ✅ **SOLUTION**: Coordinator methods return `ReadonlyArray` views

### 2. **Optional vs Required Bounds**
- ✅ **GOOD**: `rawBounds?: RawBounds` (optional)
- ⚠️ **PITFALL**: Don't make `rawBounds` required (empty data, non-finite data)
- ✅ **SOLUTION**: Optional allows graceful fallback to on-demand computation

### 3. **Data Duplication**
- ⚠️ **PROBLEM**: ChartGPU maintains duplicate arrays
- ✅ **SOLUTION**: Coordinator owns data, ChartGPU queries coordinator

### 4. **Type Narrowing for Series Types**
- ✅ **GOOD**: Discriminated union `SeriesConfig` by `type` field
- ⚠️ **PITFALL**: Don't lose type narrowing when querying runtime data
- ✅ **SOLUTION**: Coordinator methods preserve series type in return values

### 5. **Null Safety**
- ✅ **GOOD**: Arrays use `| null` for uninitialized series
- ⚠️ **PITFALL**: Don't assume arrays are always initialized
- ✅ **SOLUTION**: Defensive null checks, fallback to resolved options

---

## Functional-First Patterns

### 1. **State Ownership**
```typescript
// ✅ GOOD: Coordinator owns mutable state internally
let runtimeRawDataByIndex: Array<DataPoint[] | null> = [];

// ✅ GOOD: Public API exposes readonly views
getRuntimeRawData(index: number): ReadonlyArray<DataPoint> | null {
  return runtimeRawDataByIndex[index] ?? null;
}
```

### 2. **Immutable Updates**
```typescript
// ✅ GOOD: Functions return new state objects
const extendBoundsWithDataPoints = (
  bounds: Bounds | null,
  points: ReadonlyArray<DataPoint>
): Bounds | null => {
  // Returns new bounds object, doesn't mutate input
};
```

### 3. **Readonly Interfaces**
```typescript
// ✅ GOOD: Public interfaces use readonly
export interface RenderCoordinator {
  getRuntimeRawData(seriesIndex: number): ReadonlyArray<DataPoint> | null;
}

// ✅ GOOD: Internal state is mutable but private
let runtimeRawDataByIndex: Array<DataPoint[] | null>;  // private mutable
```

### 4. **Functional Wrapper Pattern**
```typescript
// ✅ GOOD: Coordinator wraps mutable state with functional API
export function createRenderCoordinator(...): RenderCoordinator {
  // Mutable internal state
  let runtimeRawDataByIndex: Array<DataPoint[] | null> = [];
  
  // Functional API that doesn't expose mutability
  return {
    getRuntimeRawData: (index) => runtimeRawDataByIndex[index] ?? null,
    appendData: (index, points) => {
      // Mutates internal state, but API is functional
      runtimeRawDataByIndex[index]?.push(...points);
    },
  };
}
```

---

## Testing Considerations

### 1. **AppendData Behavior**
- Test append to empty series
- Test append to series with existing data
- Test append with invalid series index
- Test append with pie series (should no-op)

### 2. **AutoScroll Behavior**
- Test pinned-to-end behavior (`end >= 99.5`)
- Test panned-away behavior (`end < 99.5`)
- Test auto-scroll disabled (`autoScroll === false`)
- Test auto-scroll with explicit x-axis bounds (should no-op)
- Test auto-scroll without zoom enabled (should no-op)

### 3. **Bounds Computation**
- Test bounds with empty data
- Test bounds with non-finite data
- Test bounds priority (runtime > resolved > fallback)
- Test incremental bounds update on append

### 4. **Coordinator Ownership**
- Test coordinator owns runtime data
- Test ChartGPU queries coordinator (no duplication)
- Test hit-testing uses coordinator data
- Test rendering uses coordinator data

### 5. **Type Safety**
- Test readonly views prevent mutation
- Test null handling for uninitialized series
- Test type narrowing preserved in query methods

---

## Migration Checklist

### Phase 1: Add Coordinator Query Methods
- [ ] Add `getRuntimeRawData()` to `RenderCoordinator` interface
- [ ] Add `getRuntimeRawBounds()` to `RenderCoordinator` interface
- [ ] Add `getRuntimeSeriesForHitTest()` to `RenderCoordinator` interface
- [ ] Implement methods in `createRenderCoordinator.ts`
- [ ] Return `ReadonlyArray` views (type safety)

### Phase 2: Update ChartGPU
- [ ] Remove `runtimeRawDataByIndex` from ChartGPU
- [ ] Remove `runtimeRawBoundsByIndex` from ChartGPU
- [ ] Update `appendData()` to not maintain own copy
- [ ] Update `getRuntimeHitTestSeries()` to query coordinator
- [ ] Update `initRuntimeHitTestStoreFromResolvedOptions()` to query coordinator

### Phase 3: Testing
- [ ] Test hit-testing with coordinator-owned data
- [ ] Test appendData reflects in hit-testing immediately
- [ ] Test auto-scroll behavior unchanged
- [ ] Test bounds computation priority unchanged
- [ ] Test type safety (readonly views)

### Phase 4: Cleanup
- [ ] Remove duplicate bounds computation helpers from ChartGPU (if any)
- [ ] Update documentation to reflect coordinator ownership
- [ ] Verify no performance regressions

---

## Summary

### Key Changes
1. **No changes needed** in `types.ts`, `defaults.ts`, `OptionResolver.ts`
2. **No changes needed** in `createRenderCoordinator.ts` (already correct)
3. **Refactor ChartGPU.ts** to query coordinator instead of maintaining duplicate arrays

### Type Safety
- Resolved types use readonly snapshots (correct)
- Coordinator owns mutable runtime arrays (correct)
- Public API exposes readonly views (to be added)

### Functional Patterns
- Coordinator wraps mutable state with functional API (correct)
- Functions return new state objects (correct)
- Readonly interfaces for public API (to be enforced)

### Risk Level
- **Low risk**: Changes are primarily in ChartGPU (query pattern)
- **No breaking changes**: Public API remains the same
- **Type safe**: Coordinator methods return readonly views
