# Custom Axis Tick Label Formatter — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an optional `tickFormatter` callback to `AxisConfig` so users can customize how tick labels are rendered on value and time axes (GitHub #138).

**Architecture:** Single new field on the existing `AxisConfig` interface. The callback intercepts label text generation in `renderAxisLabels.ts` and `computeAdaptiveTimeXAxisTicks` in `timeAxisUtils.ts`. Option resolution passes the function through via spread (no changes needed to `OptionResolver.ts`).

**Tech Stack:** TypeScript, Vitest, DOM text overlay

---

### Task 1: Add `tickFormatter` to `AxisConfig` type

**Files:**
- Modify: `src/config/types.ts:94-110`

**Step 1: Add the field to AxisConfig**

In `src/config/types.ts`, add `tickFormatter` to the `AxisConfig` interface after the `autoBounds` field:

```typescript
export interface AxisConfig {
  readonly type: AxisType;
  readonly min?: number;
  readonly max?: number;
  /** Tick length in CSS pixels (default: 6). */
  readonly tickLength?: number;
  readonly name?: string;
  /**
   * Axis domain auto-bounds mode (primarily used for y-axis):
   * - `'global'`: derive from full dataset (pre-zoom behavior)
   * - `'visible'`: derive from visible/zoomed data range (default for y-axis)
   *
   * Note: explicit `min`/`max` always take precedence over auto-bounds.
   * This option is primarily intended for `yAxis` (it has no effect on `xAxis` currently).
   */
  readonly autoBounds?: 'global' | 'visible';
  /**
   * Custom formatter for axis tick labels.
   * When provided, replaces the built-in tick label formatting.
   * For time axes, `value` is a timestamp in milliseconds (epoch-ms).
   * Return `null` to suppress a specific tick label.
   */
  readonly tickFormatter?: (value: number) => string | null;
}
```

**Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors (the field is optional, so no existing code breaks).

**Step 3: Commit**

```bash
git add src/config/types.ts
git commit -m "feat(types): add tickFormatter to AxisConfig (#138)"
```

---

### Task 2: Wire `tickFormatter` into `renderAxisLabels` for x-axis

**Files:**
- Modify: `src/core/renderCoordinator/render/renderAxisLabels.ts:111-127`
- Test: `src/core/renderCoordinator/render/__tests__/renderAxisLabels.test.ts` (create)

**Step 1: Write the failing test**

Create `src/core/renderCoordinator/render/__tests__/renderAxisLabels.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderAxisLabels, type AxisLabelRenderContext } from '../renderAxisLabels';

/**
 * Minimal mock for TextOverlay.
 * Tracks addLabel calls and returns a stub span.
 */
function createMockTextOverlay() {
  const labels: Array<{ text: string; x: number; y: number }> = [];
  return {
    labels,
    overlay: {
      clear: vi.fn(),
      addLabel: vi.fn((text: string, x: number, y: number) => {
        labels.push({ text, x, y });
        const span = document.createElement('span');
        span.textContent = text;
        return span;
      }),
    },
  };
}

function createMinimalContext(overrides: Partial<AxisLabelRenderContext> = {}): AxisLabelRenderContext {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 400;
  Object.defineProperty(canvas, 'offsetLeft', { value: 0 });
  Object.defineProperty(canvas, 'offsetTop', { value: 0 });
  // Mock clientWidth/clientHeight for CSS dimension calculation
  Object.defineProperty(canvas, 'clientWidth', { value: 800 });
  Object.defineProperty(canvas, 'clientHeight', { value: 400 });

  return {
    gpuContext: { canvas },
    currentOptions: {
      series: [{ type: 'line', data: [], color: '#fff', visible: true }],
      xAxis: { type: 'value' },
      yAxis: { type: 'value' },
      theme: {
        fontSize: 12,
        textColor: '#ffffff',
        fontFamily: 'sans-serif',
        backgroundColor: '#000',
        gridLineColor: 'rgba(255,255,255,0.1)',
        colorPalette: ['#fff'],
      },
      grid: { left: 60, right: 20, top: 40, bottom: 40 },
      dataZoom: [],
    } as any,
    xScale: {
      scale: (v: number) => -1 + (v / 100) * 2,  // maps 0-100 to -1..+1
      invert: (c: number) => ((c + 1) / 2) * 100,
    } as any,
    yScale: {
      scale: (v: number) => -1 + (v / 100) * 2,
      invert: (c: number) => ((c + 1) / 2) * 100,
    } as any,
    xTickValues: [0, 25, 50, 75, 100],
    plotClipRect: { left: -0.85, right: 0.95, top: 0.8, bottom: -0.8 },
    visibleXRangeMs: 0,
    ...overrides,
  };
}

describe('renderAxisLabels', () => {
  describe('x-axis tickFormatter', () => {
    it('uses custom tickFormatter for x-axis value labels', () => {
      const { overlay, labels } = createMockTextOverlay();
      const container = document.createElement('div');
      const context = createMinimalContext({
        currentOptions: {
          ...createMinimalContext().currentOptions,
          xAxis: {
            type: 'value' as const,
            tickFormatter: (v: number) => `$${v}`,
          },
        } as any,
      });

      renderAxisLabels(overlay as any, container, context);

      const xLabels = labels.filter((l) => l.text.startsWith('$'));
      expect(xLabels.length).toBe(5);
      expect(xLabels[0]!.text).toBe('$0');
      expect(xLabels[2]!.text).toBe('$50');
    });

    it('suppresses x-axis labels when tickFormatter returns null', () => {
      const { overlay, labels } = createMockTextOverlay();
      const container = document.createElement('div');
      const context = createMinimalContext({
        currentOptions: {
          ...createMinimalContext().currentOptions,
          xAxis: {
            type: 'value' as const,
            tickFormatter: (v: number) => (v === 50 ? null : String(v)),
          },
        } as any,
      });

      renderAxisLabels(overlay as any, container, context);

      const xLabelTexts = labels.map((l) => l.text);
      expect(xLabelTexts).not.toContain('50');
    });

    it('uses custom tickFormatter for time x-axis labels', () => {
      const { overlay, labels } = createMockTextOverlay();
      const container = document.createElement('div');
      const ts = Date.UTC(2024, 0, 15, 12, 0); // 2024-01-15T12:00Z
      const context = createMinimalContext({
        currentOptions: {
          ...createMinimalContext().currentOptions,
          xAxis: {
            type: 'time' as const,
            tickFormatter: (ms: number) => `T:${ms}`,
          },
        } as any,
        xTickValues: [ts],
      });

      renderAxisLabels(overlay as any, container, context);

      const timeLabels = labels.filter((l) => l.text.startsWith('T:'));
      expect(timeLabels.length).toBe(1);
      expect(timeLabels[0]!.text).toBe(`T:${ts}`);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/renderCoordinator/render/__tests__/renderAxisLabels.test.ts`
Expected: FAIL — the `tickFormatter` field is not yet read by `renderAxisLabels`.

**Step 3: Implement x-axis tickFormatter in renderAxisLabels**

In `src/core/renderCoordinator/render/renderAxisLabels.ts`, modify the x-axis label loop (lines 111-127).

Replace line 118:
```typescript
    const label = isTimeXAxis ? formatTimeTickValue(v, visibleXRangeMs) : formatTickValue(xFormatter!, v);
```

With:
```typescript
    const xTickFormatter = currentOptions.xAxis.tickFormatter;
    const label = xTickFormatter
      ? xTickFormatter(v)
      : isTimeXAxis
        ? formatTimeTickValue(v, visibleXRangeMs)
        : formatTickValue(xFormatter!, v);
```

Note: hoist the `xTickFormatter` lookup above the loop for performance. The final code for lines 111-127 should be:

```typescript
  const xTickFormatter = currentOptions.xAxis.tickFormatter;
  for (let i = 0; i < xTickValues.length; i++) {
    const v = xTickValues[i]!;
    const xClip = xScale.scale(v);
    const xCss = clipXToCanvasCssPx(xClip, canvasCssWidth);

    const anchor: TextOverlayAnchor =
      xTickValues.length === 1 ? 'middle' : i === 0 ? 'start' : i === xTickValues.length - 1 ? 'end' : 'middle';
    const label = xTickFormatter
      ? xTickFormatter(v)
      : isTimeXAxis
        ? formatTimeTickValue(v, visibleXRangeMs)
        : formatTickValue(xFormatter!, v);
    if (label == null) continue;

    const span = axisLabelOverlay.addLabel(label, offsetX + xCss, offsetY + xLabelY, {
      fontSize: currentOptions.theme.fontSize,
      color: currentOptions.theme.textColor,
      anchor,
    });
    styleAxisLabelSpan(span, false, currentOptions.theme);
  }
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/renderCoordinator/render/__tests__/renderAxisLabels.test.ts`
Expected: PASS (all 3 tests)

**Step 5: Commit**

```bash
git add src/core/renderCoordinator/render/renderAxisLabels.ts src/core/renderCoordinator/render/__tests__/renderAxisLabels.test.ts
git commit -m "feat: wire tickFormatter into x-axis label rendering (#138)"
```

---

### Task 3: Wire `tickFormatter` into `renderAxisLabels` for y-axis

**Files:**
- Modify: `src/core/renderCoordinator/render/renderAxisLabels.ts:139-155`
- Test: `src/core/renderCoordinator/render/__tests__/renderAxisLabels.test.ts`

**Step 1: Write the failing tests**

Add to the existing test file:

```typescript
  describe('y-axis tickFormatter', () => {
    it('uses custom tickFormatter for y-axis labels', () => {
      const { overlay, labels } = createMockTextOverlay();
      const container = document.createElement('div');
      const context = createMinimalContext({
        currentOptions: {
          ...createMinimalContext().currentOptions,
          yAxis: {
            type: 'value' as const,
            tickFormatter: (v: number) => `${(v * 100).toFixed(0)}%`,
          },
        } as any,
      });

      renderAxisLabels(overlay as any, container, context);

      const yLabels = labels.filter((l) => l.text.endsWith('%'));
      expect(yLabels.length).toBeGreaterThan(0);
      expect(yLabels.length).toBe(5); // DEFAULT_TICK_COUNT
    });

    it('suppresses y-axis labels when tickFormatter returns null', () => {
      const { overlay, labels } = createMockTextOverlay();
      const container = document.createElement('div');
      const context = createMinimalContext({
        currentOptions: {
          ...createMinimalContext().currentOptions,
          yAxis: {
            type: 'value' as const,
            tickFormatter: () => null,
          },
        } as any,
      });

      renderAxisLabels(overlay as any, container, context);

      // No y-axis labels should be rendered (all suppressed)
      // x-axis labels still render (5 ticks), plus no y-axis labels
      const allLabels = labels.map((l) => l.text);
      // Y-labels would normally be 5 ticks of values 0-100 range
      // With null formatter, none should appear
      // Only x-axis labels should be present
      expect(allLabels.length).toBe(5); // only x-axis labels
    });
  });
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/renderCoordinator/render/__tests__/renderAxisLabels.test.ts`
Expected: FAIL — y-axis doesn't check `tickFormatter` yet.

**Step 3: Implement y-axis tickFormatter in renderAxisLabels**

In `src/core/renderCoordinator/render/renderAxisLabels.ts`, modify the y-axis label loop (lines 139-155).

Replace line 145:
```typescript
    const label = formatTickValue(yFormatter, v);
```

With a pattern that checks the custom formatter first. The full y-axis loop becomes:

```typescript
  const yTickFormatter = currentOptions.yAxis.tickFormatter;
  for (let i = 0; i < yTickCount; i++) {
    const t = yTickCount <= 1 ? 0.5 : i / (yTickCount - 1);
    const v = yDomainMin + t * (yDomainMax - yDomainMin);
    const yClip = yScale.scale(v);
    const yCss = clipYToCanvasCssPx(yClip, canvasCssHeight);

    const label = yTickFormatter ? yTickFormatter(v) : formatTickValue(yFormatter, v);
    if (label == null) continue;

    const span = axisLabelOverlay.addLabel(label, offsetX + yLabelX, offsetY + yCss, {
      fontSize: currentOptions.theme.fontSize,
      color: currentOptions.theme.textColor,
      anchor: 'end',
    });
    styleAxisLabelSpan(span, false, currentOptions.theme);
    ySpans.push(span);
  }
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/renderCoordinator/render/__tests__/renderAxisLabels.test.ts`
Expected: PASS (all 5 tests)

**Step 5: Commit**

```bash
git add src/core/renderCoordinator/render/renderAxisLabels.ts src/core/renderCoordinator/render/__tests__/renderAxisLabels.test.ts
git commit -m "feat: wire tickFormatter into y-axis label rendering (#138)"
```

---

### Task 4: Wire `tickFormatter` into adaptive time x-axis tick computation

**Files:**
- Modify: `src/core/renderCoordinator/utils/timeAxisUtils.ts:263-348`
- Test: `src/core/renderCoordinator/utils/__tests__/utilities.test.ts` (add tests)

The `computeAdaptiveTimeXAxisTicks` function measures label widths to find the largest tick count that avoids overlap. It currently always calls `formatTimeTickValue` — when a custom formatter is present, it must use that instead, or the overlap calculation will be wrong.

**Step 1: Write the failing test**

Add to the existing test file `src/core/renderCoordinator/utils/__tests__/utilities.test.ts`:

```typescript
import { computeAdaptiveTimeXAxisTicks } from '../timeAxisUtils';

describe('computeAdaptiveTimeXAxisTicks with tickFormatter', () => {
  it('uses tickFormatter for label width measurement when provided', () => {
    // Create a formatter that produces very wide labels
    const wideFormatter = (v: number) => `WIDE-LABEL-${v.toFixed(0)}`;

    const mockMeasureCtx = {
      font: '',
      measureText: (text: string) => ({
        // Wide labels: simulate 20px per character
        width: text.length * 20,
      }),
    } as unknown as CanvasRenderingContext2D;

    const result = computeAdaptiveTimeXAxisTicks({
      axisMin: 0,
      axisMax: 86400000, // 1 day in ms
      xScale: {
        scale: (v: number) => -1 + (v / 86400000) * 2,
        invert: (c: number) => ((c + 1) / 2) * 86400000,
      } as any,
      plotClipLeft: -0.85,
      plotClipRight: 0.95,
      canvasCssWidth: 400, // narrow canvas
      visibleRangeMs: 86400000,
      measureCtx: mockMeasureCtx,
      fontSize: 12,
      fontFamily: 'sans-serif',
      tickFormatter: wideFormatter,
    });

    // Wide labels on narrow canvas should produce fewer ticks than default
    expect(result.tickCount).toBeLessThan(9);
    expect(result.tickValues.length).toBe(result.tickCount);
  });

  it('falls back to formatTimeTickValue when tickFormatter is not provided', () => {
    const mockMeasureCtx = {
      font: '',
      measureText: () => ({ width: 40 }), // reasonable width
    } as unknown as CanvasRenderingContext2D;

    const result = computeAdaptiveTimeXAxisTicks({
      axisMin: 0,
      axisMax: 86400000,
      xScale: {
        scale: (v: number) => -1 + (v / 86400000) * 2,
        invert: (c: number) => ((c + 1) / 2) * 86400000,
      } as any,
      plotClipLeft: -0.85,
      plotClipRight: 0.95,
      canvasCssWidth: 800,
      visibleRangeMs: 86400000,
      measureCtx: mockMeasureCtx,
      fontSize: 12,
      fontFamily: 'sans-serif',
      // no tickFormatter
    });

    // With normal-width labels on wide canvas, should get a reasonable tick count
    expect(result.tickCount).toBeGreaterThanOrEqual(1);
    expect(result.tickValues.length).toBe(result.tickCount);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/renderCoordinator/utils/__tests__/utilities.test.ts`
Expected: FAIL — `tickFormatter` is not a recognized parameter of `computeAdaptiveTimeXAxisTicks`.

**Step 3: Add `tickFormatter` parameter to `computeAdaptiveTimeXAxisTicks`**

In `src/core/renderCoordinator/utils/timeAxisUtils.ts`, modify the params type (line 263-288) to add an optional `tickFormatter`:

```typescript
export const computeAdaptiveTimeXAxisTicks = (params: {
  readonly axisMin: number | null;
  readonly axisMax: number | null;
  readonly xScale: LinearScale;
  readonly plotClipLeft: number;
  readonly plotClipRight: number;
  readonly canvasCssWidth: number;
  readonly visibleRangeMs: number;
  readonly measureCtx: CanvasRenderingContext2D | null;
  readonly measureCache?: Map<string, number>;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly tickFormatter?: (value: number) => string | null;
}): { readonly tickCount: number; readonly tickValues: readonly number[] } => {
```

Then destructure it (add after line 288):
```typescript
  const { ..., tickFormatter } = params;
```

Then modify line 314 where `formatTimeTickValue` is called inside the loop:

Replace:
```typescript
      const label = formatTimeTickValue(v, visibleRangeMs);
```

With:
```typescript
      const label = tickFormatter ? tickFormatter(v) : formatTimeTickValue(v, visibleRangeMs);
```

**Step 4: Pass `tickFormatter` from the call site**

Find where `computeAdaptiveTimeXAxisTicks` is called. It's in `src/core/createRenderCoordinator.ts`. Search for the call and add `tickFormatter: currentOptions.xAxis.tickFormatter` to the params object.

Run: `grep -n 'computeAdaptiveTimeXAxisTicks' src/core/createRenderCoordinator.ts`

Add `tickFormatter: currentOptions.xAxis.tickFormatter` to the call's parameter object.

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/core/renderCoordinator/utils/__tests__/utilities.test.ts`
Expected: PASS

**Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (no regressions).

**Step 7: Commit**

```bash
git add src/core/renderCoordinator/utils/timeAxisUtils.ts src/core/renderCoordinator/utils/__tests__/utilities.test.ts src/core/createRenderCoordinator.ts
git commit -m "feat: support tickFormatter in adaptive time axis tick computation (#138)"
```

---

### Task 5: Update documentation

**Files:**
- Modify: `docs/api/options.md` (Axis Configuration section)

**Step 1: Add tickFormatter to the Axis Configuration section**

In `docs/api/options.md`, after the `autoBounds` documentation in the Axis Configuration section, add:

```markdown
- **`AxisConfig.tickFormatter?: (value: number) => string | null`**: custom formatter for axis tick labels. When provided, replaces the built-in tick label formatting for that axis.
  - For `type: 'value'` axes, `value` is the numeric tick value.
  - For `type: 'time'` axes, `value` is a timestamp in milliseconds (epoch-ms, same unit as `new Date(ms)`).
  - Return a `string` to display as the label, or `null` to suppress that specific tick label.
  - When omitted, ChartGPU uses its built-in formatting: `Intl.NumberFormat` for value axes, adaptive tier-based date formatting for time axes.
  - The formatter is also used for label width measurement in the adaptive time x-axis tick count algorithm, ensuring overlap avoidance uses the correct label widths.

#### Tick Formatter Examples

```ts
// Duration formatting (seconds → human-readable)
yAxis: {
  tickFormatter: (seconds) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    return d > 0 ? `${d}d ${h}h` : `${h}h`;
  }
}

// Percentage formatting (0–1 → 0%–100%)
yAxis: { tickFormatter: (v) => `${(v * 100).toFixed(0)}%` }

// Integer-only ticks (suppress fractional labels)
xAxis: { tickFormatter: (v) => Number.isInteger(v) ? v.toLocaleString() : null }

// Custom time axis formatting
xAxis: {
  type: 'time',
  tickFormatter: (ms) => new Date(ms).toLocaleDateString('de-DE')
}

// Append units
yAxis: { tickFormatter: (v) => `${v.toFixed(1)} ms` }
```
```

**Step 2: Commit**

```bash
git add docs/api/options.md
git commit -m "docs: add tickFormatter to axis configuration docs (#138)"
```

---

### Task 6: Create example page for visual verification

**Files:**
- Create: `examples/tick-formatter/index.html`
- Create: `examples/tick-formatter/main.ts`

**Step 1: Create the example**

Create `examples/tick-formatter/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ChartGPU – Custom Tick Formatter</title>
  <style>
    body { margin: 0; background: #1a1a2e; color: #eee; font-family: system-ui; }
    .container { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px; }
    .chart-box { height: 300px; background: #16213e; border-radius: 8px; }
    h1 { text-align: center; margin: 16px 0 0; font-size: 1.2rem; }
    h2 { text-align: center; font-size: 0.9rem; font-weight: 400; color: #888; margin: 4px 0; }
  </style>
</head>
<body>
  <h1>Custom Tick Formatter Examples</h1>
  <div class="container">
    <div>
      <h2>Percentage Y-axis</h2>
      <div id="chart-percent" class="chart-box"></div>
    </div>
    <div>
      <h2>Duration Y-axis (seconds → human)</h2>
      <div id="chart-duration" class="chart-box"></div>
    </div>
    <div>
      <h2>Custom Time X-axis (locale)</h2>
      <div id="chart-time" class="chart-box"></div>
    </div>
    <div>
      <h2>Integer-only X-axis (null suppression)</h2>
      <div id="chart-integer" class="chart-box"></div>
    </div>
  </div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

Create `examples/tick-formatter/main.ts`:
```typescript
import { ChartGPU } from '../../src';

async function init() {
  // 1. Percentage y-axis
  await ChartGPU.create(document.getElementById('chart-percent')!, {
    series: [{
      type: 'line',
      data: Array.from({ length: 20 }, (_, i) => [i, Math.random()]),
    }],
    yAxis: {
      tickFormatter: (v) => `${(v * 100).toFixed(0)}%`,
    },
  });

  // 2. Duration y-axis
  await ChartGPU.create(document.getElementById('chart-duration')!, {
    series: [{
      type: 'scatter',
      data: Array.from({ length: 30 }, (_, i) => [i, Math.random() * 172800]),
    }],
    yAxis: {
      tickFormatter: (seconds) => {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
      },
    },
  });

  // 3. Custom time x-axis
  const now = Date.now();
  await ChartGPU.create(document.getElementById('chart-time')!, {
    series: [{
      type: 'line',
      data: Array.from({ length: 50 }, (_, i) => [now - (50 - i) * 86400000, Math.random() * 100]),
    }],
    xAxis: {
      type: 'time',
      tickFormatter: (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    },
  });

  // 4. Integer-only x-axis (suppress fractional labels)
  await ChartGPU.create(document.getElementById('chart-integer')!, {
    series: [{
      type: 'bar',
      data: Array.from({ length: 8 }, (_, i) => [i + 1, Math.random() * 50 + 10]),
    }],
    xAxis: {
      tickFormatter: (v) => Number.isInteger(v) ? v.toLocaleString() : null,
    },
    yAxis: {
      tickFormatter: (v) => `${v.toFixed(0)} req/s`,
    },
  });
}

init().catch(console.error);
```

**Step 2: Verify the example loads**

Run: `npm run dev`
Navigate to: `http://localhost:5176/examples/tick-formatter/`
Expected: Four charts render with custom-formatted tick labels.

**Step 3: Commit**

```bash
git add examples/tick-formatter/
git commit -m "feat: add tick-formatter example page (#138)"
```

---

### Task 7: Run full test suite and verify no regressions

**Files:** None (verification only)

**Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 2: Run TypeScript type checking**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Build the library**

Run: `npm run build`
Expected: Builds successfully.
