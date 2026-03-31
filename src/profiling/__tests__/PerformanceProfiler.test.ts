import { describe, it, expect } from 'vitest';
import {
  createProfiler,
  destroyProfiler,
  beginSpan,
  endSpan,
  recordSpan,
  measure,
  measureAsync,
  recordCounter,
  getSnapshot,
  clearProfiler,
  exportTrace,
  exportTraceJSON,
} from '../PerformanceProfiler';

describe('createProfiler', () => {
  it('returns a handle with a unique id symbol', () => {
    const p1 = createProfiler();
    const p2 = createProfiler();
    expect(typeof p1.id).toBe('symbol');
    expect(p1.id).not.toBe(p2.id);
    destroyProfiler(p1);
    destroyProfiler(p2);
  });

  it('getSnapshot returns empty arrays for a fresh profiler', () => {
    const p = createProfiler();
    const snap = getSnapshot(p);
    expect(snap.spans).toHaveLength(0);
    expect(snap.counters).toHaveLength(0);
    expect(snap.stats).toHaveLength(0);
    destroyProfiler(p);
  });

  it('getSnapshot returns empty arrays after destroyProfiler', () => {
    const p = createProfiler();
    const token = beginSpan(p, 'test', 'cat');
    endSpan(p, token);
    destroyProfiler(p);
    const snap = getSnapshot(p);
    expect(snap.spans).toHaveLength(0);
  });
});

describe('beginSpan / endSpan', () => {
  it('records a span with correct name, cat, and positive duration', () => {
    const p = createProfiler();
    const token = beginSpan(p, 'renderFrame', 'render');
    endSpan(p, token);
    const { spans } = getSnapshot(p);
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('renderFrame');
    expect(spans[0].cat).toBe('render');
    expect(spans[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(spans[0].endMs).toBeGreaterThanOrEqual(spans[0].startMs);
    destroyProfiler(p);
  });

  it('records span args when provided', () => {
    const p = createProfiler();
    const token = beginSpan(p, 'upload', 'gpu', { bytes: 1024, compressed: false });
    endSpan(p, token);
    const { spans } = getSnapshot(p);
    expect(spans[0].args).toEqual({ bytes: 1024, compressed: false });
    destroyProfiler(p);
  });

  it('silently ignores endSpan for an unknown token', () => {
    const p = createProfiler();
    const ghost = Symbol('ghost');
    expect(() => endSpan(p, ghost)).not.toThrow();
    expect(getSnapshot(p).spans).toHaveLength(0);
    destroyProfiler(p);
  });

  it('does not record spans when profiler is disabled', () => {
    const p = createProfiler({ enabled: false });
    const token = beginSpan(p, 'render', 'render');
    endSpan(p, token);
    expect(getSnapshot(p).spans).toHaveLength(0);
    destroyProfiler(p);
  });

  it('wraps oldest span when circular buffer is full', () => {
    const p = createProfiler({ maxSpans: 3 });
    for (let i = 0; i < 5; i++) {
      const t = beginSpan(p, `span${i}`, 'test');
      endSpan(p, t);
    }
    const { spans } = getSnapshot(p);
    // Only 3 spans retained
    expect(spans).toHaveLength(3);
    // The retained spans are the most recent 3 (span2, span3, span4)
    const names = spans.map((s) => s.name);
    expect(names).toContain('span2');
    expect(names).toContain('span3');
    expect(names).toContain('span4');
    destroyProfiler(p);
  });
});

describe('recordSpan', () => {
  it('records a complete span from explicit start/end times', () => {
    const p = createProfiler();
    const t0 = performance.now();
    const t1 = t0 + 5.5;
    recordSpan(p, 'drawCall', 'gpu', t0, t1, { drawCount: 3 });
    const { spans } = getSnapshot(p);
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('drawCall');
    expect(spans[0].durationMs).toBeCloseTo(5.5, 5);
    destroyProfiler(p);
  });
});

describe('measure', () => {
  it('wraps a sync function and records a span', () => {
    const p = createProfiler();
    const result = measure(p, 'compute', 'data', () => 42);
    expect(result).toBe(42);
    const { spans } = getSnapshot(p);
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('compute');
    destroyProfiler(p);
  });

  it('still records the span when the wrapped function throws', () => {
    const p = createProfiler();
    expect(() =>
      measure(p, 'bad', 'data', () => {
        throw new Error('boom');
      })
    ).toThrow('boom');
    // Span should still be recorded
    expect(getSnapshot(p).spans).toHaveLength(1);
    destroyProfiler(p);
  });
});

describe('measureAsync', () => {
  it('wraps an async function and records a span', async () => {
    const p = createProfiler();
    const result = await measureAsync(p, 'asyncOp', 'gpu', async () => {
      await Promise.resolve();
      return 'done';
    });
    expect(result).toBe('done');
    const { spans } = getSnapshot(p);
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('asyncOp');
    destroyProfiler(p);
  });

  it('records the span even when the async function rejects', async () => {
    const p = createProfiler();
    await expect(
      measureAsync(p, 'failOp', 'gpu', async () => {
        throw new Error('async boom');
      })
    ).rejects.toThrow('async boom');
    expect(getSnapshot(p).spans).toHaveLength(1);
    destroyProfiler(p);
  });
});

describe('recordCounter', () => {
  it('records counter samples with name, time, and value', () => {
    const p = createProfiler();
    recordCounter(p, 'gpuBufferBytes', 4096);
    recordCounter(p, 'gpuBufferBytes', 8192);
    const { counters } = getSnapshot(p);
    expect(counters).toHaveLength(2);
    expect(counters[0].name).toBe('gpuBufferBytes');
    expect(counters[0].value).toBe(4096);
    expect(counters[1].value).toBe(8192);
    expect(counters[1].timeMs).toBeGreaterThanOrEqual(counters[0].timeMs);
    destroyProfiler(p);
  });

  it('wraps oldest counter when buffer is full', () => {
    const p = createProfiler({ maxCounters: 2 });
    recordCounter(p, 'x', 1);
    recordCounter(p, 'x', 2);
    recordCounter(p, 'x', 3);
    const { counters } = getSnapshot(p);
    expect(counters).toHaveLength(2);
    const values = counters.map((c) => c.value);
    expect(values).toContain(2);
    expect(values).toContain(3);
    destroyProfiler(p);
  });
});

describe('getSnapshot / stats', () => {
  it('computes aggregated stats grouped by name+cat', () => {
    const p = createProfiler();
    // Record 3 spans for the same operation with known durations
    const t = performance.now();
    recordSpan(p, 'render', 'frame', t, t + 10);
    recordSpan(p, 'render', 'frame', t + 10, t + 20); // 10ms
    recordSpan(p, 'render', 'frame', t + 20, t + 25); // 5ms
    recordSpan(p, 'upload', 'gpu', t, t + 3);

    const { stats } = getSnapshot(p);

    const renderStat = stats.find((s) => s.name === 'render' && s.cat === 'frame');
    expect(renderStat).toBeDefined();
    expect(renderStat!.count).toBe(3);
    expect(renderStat!.minMs).toBeCloseTo(5, 0);
    expect(renderStat!.maxMs).toBeCloseTo(10, 0);

    const uploadStat = stats.find((s) => s.name === 'upload' && s.cat === 'gpu');
    expect(uploadStat).toBeDefined();
    expect(uploadStat!.count).toBe(1);
    destroyProfiler(p);
  });

  it('stats are sorted by totalMs descending', () => {
    const p = createProfiler();
    const t = performance.now();
    recordSpan(p, 'cheap', 'test', t, t + 1);
    recordSpan(p, 'expensive', 'test', t, t + 100);
    const { stats } = getSnapshot(p);
    expect(stats[0].name).toBe('expensive');
    destroyProfiler(p);
  });
});

describe('clearProfiler', () => {
  it('removes all spans, counters, and active spans', () => {
    const p = createProfiler();
    const t = beginSpan(p, 'open', 'test');
    recordCounter(p, 'x', 1);
    endSpan(p, t);
    clearProfiler(p);
    const snap = getSnapshot(p);
    expect(snap.spans).toHaveLength(0);
    expect(snap.counters).toHaveLength(0);
    destroyProfiler(p);
  });
});

describe('exportTrace', () => {
  it('returns a traceEvents array with one X-phase event per span', () => {
    const p = createProfiler();
    const t0 = performance.now();
    recordSpan(p, 'drawGeometry', 'gpu', t0, t0 + 2);
    const trace = exportTrace(p);
    expect(Array.isArray(trace.traceEvents)).toBe(true);
    const spanEvent = trace.traceEvents.find((e) => e.ph === 'X');
    expect(spanEvent).toBeDefined();
    expect(spanEvent!.name).toBe('drawGeometry');
    expect(spanEvent!.cat).toBe('gpu');
    // Duration should be 2ms converted to microseconds = 2000
    expect(spanEvent!.dur).toBeCloseTo(2000, 0);
    destroyProfiler(p);
  });

  it('includes counter events with ph=C', () => {
    const p = createProfiler();
    recordCounter(p, 'bufferBytes', 512);
    const trace = exportTrace(p);
    const counterEvent = trace.traceEvents.find((e) => e.ph === 'C');
    expect(counterEvent).toBeDefined();
    expect(counterEvent!.name).toBe('bufferBytes');
    destroyProfiler(p);
  });

  it('includes metadata when provided', () => {
    const p = createProfiler();
    const trace = exportTrace(p, { version: '0.3.2', renderer: 'webgpu' });
    expect(trace.metadata?.version).toBe('0.3.2');
    destroyProfiler(p);
  });

  it('trace events are sorted by timestamp', () => {
    const p = createProfiler();
    const t = performance.now();
    recordSpan(p, 'b', 'test', t + 10, t + 12);
    recordSpan(p, 'a', 'test', t, t + 2);
    const trace = exportTrace(p);
    const ts = trace.traceEvents.map((e) => e.ts);
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]);
    }
    destroyProfiler(p);
  });
});

describe('exportTraceJSON', () => {
  it('returns valid JSON that parses back to a TraceExport', () => {
    const p = createProfiler();
    const t = performance.now();
    recordSpan(p, 'render', 'frame', t, t + 1);
    const json = exportTraceJSON(p);
    const parsed = JSON.parse(json) as { traceEvents: unknown[] };
    expect(Array.isArray(parsed.traceEvents)).toBe(true);
    destroyProfiler(p);
  });
});
