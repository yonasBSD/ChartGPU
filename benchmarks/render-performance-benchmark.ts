/**
 * Render Performance Benchmark
 *
 * Measures ChartGPU's core render pipeline operations using the built-in
 * profiling infrastructure (PerformanceProfiler).  Exercises the critical
 * paths exercised on every frame:
 *
 *   1. Data packing            – DataPoint[] → Float32Array
 *   2. LTTB downsampling       – 1M points → various targets
 *   3. Scale computation       – domain/range mapping
 *   4. Easing functions        – animation curve evaluation
 *
 * Each workload is profiled with the span-based PerformanceProfiler so the
 * results can be viewed as a flame graph in chrome://tracing.
 *
 * Usage:
 *   tsx benchmarks/render-performance-benchmark.ts
 *   tsx benchmarks/render-performance-benchmark.ts --export-trace trace.json
 */

import { packDataPoints } from '../src/data/packDataPoints';
import type { DataPoint } from '../src/config/types';
import { createLinearScale } from '../src/utils/scales';
import { easeCubicInOut } from '../src/utils/easing';
import {
  createProfiler,
  destroyProfiler,
  measure,
  recordCounter,
  getSnapshot,
  exportTraceJSON,
} from '../src/profiling';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function generateSineData(count: number): DataPoint[] {
  const data: DataPoint[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const x = i * 0.001;
    const y = Math.sin(x) * 0.9 + Math.sin(x * 3.7) * 0.1 + (Math.random() - 0.5) * 0.05;
    data[i] = [x, y] as const;
  }
  return data;
}

function fmt(n: number, decimals = 3): string {
  return n.toFixed(decimals).padStart(10);
}

// ---------------------------------------------------------------------------
// Benchmark suites
// ---------------------------------------------------------------------------

interface BenchResult {
  name: string;
  scale: string;
  runs: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
  opsPerSec: number;
}

function benchmarkDataPacking(profiler: ReturnType<typeof createProfiler>): BenchResult[] {
  const scales = [
    { label: '10K', count: 10_000 },
    { label: '100K', count: 100_000 },
    { label: '1M', count: 1_000_000 },
  ];
  const runs = 10;
  const results: BenchResult[] = [];

  for (const { label, count } of scales) {
    const data = generateSineData(count);
    recordCounter(profiler, 'packingDataPoints', count);
    const times: number[] = [];

    for (let r = 0; r < runs; r++) {
      const t0 = performance.now();
      measure(profiler, `packDataPoints-${label}`, 'data', () => packDataPoints(data));
      const t1 = performance.now();
      times.push(t1 - t0);
    }

    const med = median(times);
    results.push({
      name: 'packDataPoints',
      scale: label,
      runs,
      medianMs: med,
      minMs: Math.min(...times),
      maxMs: Math.max(...times),
      opsPerSec: med > 0 ? 1000 / med : Infinity,
    });
  }

  return results;
}

function benchmarkScaleComputation(profiler: ReturnType<typeof createProfiler>): BenchResult[] {
  const scales = [
    { label: '10K', count: 10_000 },
    { label: '100K', count: 100_000 },
    { label: '1M', count: 1_000_000 },
  ];
  const runs = 10;
  const results: BenchResult[] = [];

  for (const { label, count } of scales) {
    const linearScale = createLinearScale().domain(0, count).range(0, 800);
    const inputs = new Float64Array(count);
    for (let i = 0; i < count; i++) inputs[i] = i;

    recordCounter(profiler, 'scaleInputCount', count);
    const times: number[] = [];

    for (let r = 0; r < runs; r++) {
      const t0 = performance.now();
      measure(profiler, `linearScale-${label}`, 'compute', () => {
        let sum = 0;
        for (let i = 0; i < count; i++) sum += linearScale.scale(inputs[i]);
        return sum;
      });
      const t1 = performance.now();
      times.push(t1 - t0);
    }

    const med = median(times);
    results.push({
      name: 'linearScale',
      scale: label,
      runs,
      medianMs: med,
      minMs: Math.min(...times),
      maxMs: Math.max(...times),
      opsPerSec: med > 0 ? (count / med) * 1000 : Infinity,
    });
  }

  return results;
}

function benchmarkEasing(profiler: ReturnType<typeof createProfiler>): BenchResult[] {
  const scales = [
    { label: '100K', count: 100_000 },
    { label: '1M', count: 1_000_000 },
  ];
  const runs = 10;
  const results: BenchResult[] = [];

  for (const { label, count } of scales) {
    const times: number[] = [];

    for (let r = 0; r < runs; r++) {
      const t0 = performance.now();
      measure(profiler, `easeCubicInOut-${label}`, 'animation', () => {
        let sum = 0;
        for (let i = 0; i < count; i++) sum += easeCubicInOut(i / count);
        return sum;
      });
      const t1 = performance.now();
      times.push(t1 - t0);
    }

    const med = median(times);
    results.push({
      name: 'easeCubicInOut',
      scale: label,
      runs,
      medianMs: med,
      minMs: Math.min(...times),
      maxMs: Math.max(...times),
      opsPerSec: med > 0 ? (count / med) * 1000 : Infinity,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function printResults(title: string, results: BenchResult[]): void {
  console.log(`\n${title}`);
  console.log('-'.repeat(80));
  console.log(
    'Name'.padEnd(22) +
    'Scale'.padEnd(8) +
    'Median (ms)'.padStart(12) +
    'Min (ms)'.padStart(10) +
    'Max (ms)'.padStart(10) +
    'ops/sec'.padStart(14),
  );
  console.log('-'.repeat(80));

  for (const r of results) {
    const opsStr =
      r.opsPerSec === Infinity ? '   ∞' : r.opsPerSec.toFixed(0).padStart(14);
    console.log(
      r.name.padEnd(22) +
      r.scale.padEnd(8) +
      fmt(r.medianMs) +
      fmt(r.minMs) +
      fmt(r.maxMs) +
      opsStr,
    );
  }
}

function run(): void {
  const args = process.argv.slice(2);
  const exportIdx = args.indexOf('--export-trace');
  const exportPath = exportIdx !== -1 ? args[exportIdx + 1] : null;

  const profiler = createProfiler({ enabled: true, maxSpans: 50_000 });

  console.log('ChartGPU Render Performance Benchmark');
  console.log('='.repeat(80));

  const packResults = benchmarkDataPacking(profiler);
  const scaleResults = benchmarkScaleComputation(profiler);
  const easingResults = benchmarkEasing(profiler);

  printResults('Data Packing (packDataPoints)', packResults);
  printResults('Scale Computation (linearScale)', scaleResults);
  printResults('Easing Functions (easeCubicInOut)', easingResults);

  // Print profiler stats summary
  const snap = getSnapshot(profiler);
  console.log(`\nProfiler recorded ${snap.spans.length} spans`);
  console.log('\nTop 5 operations by total time:');
  for (const stat of snap.stats.slice(0, 5)) {
    console.log(
      `  [${stat.cat}] ${stat.name}: count=${stat.count} total=${stat.totalMs.toFixed(2)}ms avg=${stat.avgMs.toFixed(3)}ms p95=${stat.p95Ms.toFixed(3)}ms`,
    );
  }

  if (exportPath) {
    const json = exportTraceJSON(profiler, { benchmark: 'render-performance', version: '0.3.2' });
    fs.writeFileSync(exportPath, json, 'utf-8');
    console.log(`\nTrace exported to: ${exportPath}`);
    console.log('Load in chrome://tracing or https://ui.perfetto.dev to view flame graph.');
  } else {
    console.log('\nTip: run with --export-trace trace.json to save a flame-graph trace.');
  }

  destroyProfiler(profiler);
  console.log('='.repeat(80));
}

run();
