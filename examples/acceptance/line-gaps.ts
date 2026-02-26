/**
 * Acceptance test: Line segmentation via null gaps.
 *
 * Validates:
 * 1. Null entries in data arrays are preserved through option resolution
 * 2. connectNulls: true strips nulls from resolved data
 * 3. Bounds computation skips null entries
 * 4. Sampling is bypassed when gaps present
 */

import { resolveOptions } from '../../src/config/OptionResolver';
import { computeRawBoundsFromCartesianData, getPointCount, hasNullGaps, filterNullGaps } from '../../src/data/cartesianData';
import type { DataPoint } from '../../src/config/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

// --- Test data ---
const dataWithGaps: (DataPoint | null)[] = [
  [0, 2], [1, 5], [2, 3],
  null,
  [4, 7], [5, 4],
  null,
  [7, 8], [8, 6],
];

// --- 1. Null gap detection ---
console.log('\n1. Null gap detection');
assert(hasNullGaps(dataWithGaps) === true, 'hasNullGaps detects null entries');
assert(hasNullGaps([[0, 1], [1, 2]]) === false, 'hasNullGaps returns false for clean data');
assert(hasNullGaps(new Float32Array([0, 1, 2, 3])) === false, 'hasNullGaps returns false for Float32Array');

// --- 2. Null filtering ---
console.log('\n2. Null filtering (connectNulls)');
const filtered = filterNullGaps(dataWithGaps);
assert(filtered.length === 7, `filterNullGaps removes nulls (got ${filtered.length}, expected 7)`);
assert(filtered.every(p => p !== null), 'filterNullGaps produces no null entries');

// --- 3. Bounds computation ---
console.log('\n3. Bounds computation with gaps');
const bounds = computeRawBoundsFromCartesianData(dataWithGaps as any);
assert(bounds !== null, 'computeRawBoundsFromCartesianData returns non-null');
if (bounds) {
  assert(bounds.xMin === 0, `xMin is 0 (got ${bounds.xMin})`);
  assert(bounds.xMax === 8, `xMax is 8 (got ${bounds.xMax})`);
  assert(bounds.yMin === 2, `yMin is 2 (got ${bounds.yMin})`);
  assert(bounds.yMax === 8, `yMax is 8 (got ${bounds.yMax})`);
}

// --- 4. Option resolution ---
console.log('\n4. Option resolution');
const resolved = resolveOptions({
  series: [{ type: 'line', data: dataWithGaps as any }],
});
const lineSeries = resolved.series[0];
assert(lineSeries.type === 'line', 'Series type is line');
if (lineSeries.type === 'line') {
  assert(lineSeries.connectNulls === false, 'connectNulls defaults to false');
  assert(getPointCount(lineSeries.data) === 9, `Point count preserved (got ${getPointCount(lineSeries.data)}, expected 9)`);
}

// --- 5. connectNulls resolution ---
console.log('\n5. connectNulls: true resolution');
const resolvedConnected = resolveOptions({
  series: [{ type: 'line', data: dataWithGaps as any, connectNulls: true }],
});
const connectedSeries = resolvedConnected.series[0];
if (connectedSeries.type === 'line') {
  assert(connectedSeries.connectNulls === true, 'connectNulls resolves to true');
}

// --- 6. Sampling bypass ---
console.log('\n6. Sampling bypass with gaps');
const bigDataWithGaps: (DataPoint | null)[] = [];
for (let i = 0; i < 10000; i++) {
  bigDataWithGaps.push(i === 5000 ? null : [i, Math.sin(i)]);
}
const resolvedSampled = resolveOptions({
  series: [{ type: 'line', data: bigDataWithGaps as any, sampling: 'lttb', samplingThreshold: 5000 }],
});
const sampledSeries = resolvedSampled.series[0];
if (sampledSeries.type === 'line') {
  const count = getPointCount(sampledSeries.data);
  assert(count === 10000, `Sampling bypassed: point count is ${count} (expected 10000)`);
}

// --- Summary ---
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
