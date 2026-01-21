import { ohlcSample } from '../../src/data/ohlcSample';
import type { OHLCDataPoint, OHLCDataPointObject, OHLCDataPointTuple } from '../../src/config/types';

// TypeScript-only acceptance checks for OHLC downsampling.
// This file is excluded from the library build (tsconfig excludes `examples/`).
//
// Intent: validate ohlcSample() preserves endpoints, aggregates OHLC semantics correctly,
// and handles edge cases properly for both tuple and object input formats.

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const assertEqual = <T>(label: string, actual: T, expected: T): void => {
  assert(
    actual === expected,
    `${label}: expected ${expected} but got ${actual}`,
  );
};

const assertArrayLength = (label: string, arr: ReadonlyArray<unknown>, expected: number): void => {
  assertEqual(`${label} length`, arr.length, expected);
};

// Helper to compare OHLC values (works for both tuple and object)
const assertOHLCEqual = (
  label: string,
  actual: OHLCDataPoint,
  expected: { timestamp: number; open: number; close: number; low: number; high: number },
): void => {
  if (Array.isArray(actual)) {
    // Tuple format: [timestamp, open, close, low, high]
    assertEqual(`${label} timestamp`, actual[0], expected.timestamp);
    assertEqual(`${label} open`, actual[1], expected.open);
    assertEqual(`${label} close`, actual[2], expected.close);
    assertEqual(`${label} low`, actual[3], expected.low);
    assertEqual(`${label} high`, actual[4], expected.high);
  } else {
    // Object format
    assertEqual(`${label} timestamp`, actual.timestamp, expected.timestamp);
    assertEqual(`${label} open`, actual.open, expected.open);
    assertEqual(`${label} close`, actual.close, expected.close);
    assertEqual(`${label} low`, actual.low, expected.low);
    assertEqual(`${label} high`, actual.high, expected.high);
  }
};

// =============================================================================
// 1. TUPLE INPUT TESTS
// =============================================================================

console.log('[acceptance:ohlc-sample] Testing tuple input format...');

// 1.1 Basic downsampling with tuple input
{
  const input: OHLCDataPointTuple[] = [
    [0, 100, 102, 99, 103], // first
    [1, 102, 105, 101, 106],
    [2, 105, 104, 103, 107],
    [3, 104, 108, 103, 109],
    [4, 108, 110, 107, 111], // last
  ];

  const result = ohlcSample(input, 3);
  assertArrayLength('tuple basic downsample', result, 3);

  // Verify endpoints preserved
  assertOHLCEqual('tuple first candle', result[0]!, { timestamp: 0, open: 100, close: 102, low: 99, high: 103 });
  assertOHLCEqual('tuple last candle', result[2]!, { timestamp: 4, open: 108, close: 110, low: 107, high: 111 });

  // Middle bucket should aggregate candles at indices 1-3
  // timestamp and open from first candle in bucket (index 1)
  // close from last candle in bucket (index 3)
  // high = max(106, 107, 109) = 109
  // low = min(101, 103, 103) = 101
  assertOHLCEqual('tuple middle candle', result[1]!, { timestamp: 1, open: 102, close: 108, low: 101, high: 109 });

  // Verify output format matches input (tuple -> tuple)
  assert(Array.isArray(result[0]), 'tuple output should be tuple');
  assert(Array.isArray(result[1]), 'tuple output should be tuple');
  assert(Array.isArray(result[2]), 'tuple output should be tuple');
}

// 1.2 Aggregation rules verification with tuple input
{
  // Construct data where aggregation rules are explicit
  const input: OHLCDataPointTuple[] = [
    [0, 50, 52, 49, 53], // first - preserved
    [1, 60, 62, 59, 63], // bucket start: timestamp + open from here
    [2, 70, 72, 69, 100], // bucket: high here (100)
    [3, 30, 32, 10, 33], // bucket: low here (10)
    [4, 40, 80, 39, 81], // bucket end: close from here (80)
    [5, 90, 92, 89, 93], // last - preserved
  ];

  const result = ohlcSample(input, 3);
  assertArrayLength('tuple aggregation', result, 3);

  // First and last preserved
  assertOHLCEqual('tuple agg first', result[0]!, { timestamp: 0, open: 50, close: 52, low: 49, high: 53 });
  assertOHLCEqual('tuple agg last', result[2]!, { timestamp: 5, open: 90, close: 92, low: 89, high: 93 });

  // Middle bucket (indices 1-4):
  // - timestamp and open from index 1: timestamp=1, open=60
  // - close from index 4: close=80
  // - high = max(63, 100, 33, 81) = 100
  // - low = min(59, 69, 10, 39) = 10
  assertOHLCEqual('tuple agg middle', result[1]!, { timestamp: 1, open: 60, close: 80, low: 10, high: 100 });
}

// =============================================================================
// 2. OBJECT INPUT TESTS
// =============================================================================

console.log('[acceptance:ohlc-sample] Testing object input format...');

// 2.1 Basic downsampling with object input
{
  const input: OHLCDataPointObject[] = [
    { timestamp: 0, open: 100, close: 102, low: 99, high: 103 }, // first
    { timestamp: 1, open: 102, close: 105, low: 101, high: 106 },
    { timestamp: 2, open: 105, close: 104, low: 103, high: 107 },
    { timestamp: 3, open: 104, close: 108, low: 103, high: 109 },
    { timestamp: 4, open: 108, close: 110, low: 107, high: 111 }, // last
  ];

  const result = ohlcSample(input, 3);
  assertArrayLength('object basic downsample', result, 3);

  // Verify endpoints preserved
  assertOHLCEqual('object first candle', result[0]!, { timestamp: 0, open: 100, close: 102, low: 99, high: 103 });
  assertOHLCEqual('object last candle', result[2]!, { timestamp: 4, open: 108, close: 110, low: 107, high: 111 });

  // Middle bucket aggregation (same as tuple test)
  assertOHLCEqual('object middle candle', result[1]!, { timestamp: 1, open: 102, close: 108, low: 101, high: 109 });

  // Verify output format matches input (object -> object)
  assert(!Array.isArray(result[0]), 'object output should be object');
  assert(!Array.isArray(result[1]), 'object output should be object');
  assert(!Array.isArray(result[2]), 'object output should be object');
}

// 2.2 Aggregation rules verification with object input
{
  const input: OHLCDataPointObject[] = [
    { timestamp: 0, open: 50, close: 52, low: 49, high: 53 }, // first - preserved
    { timestamp: 1, open: 60, close: 62, low: 59, high: 63 }, // bucket start
    { timestamp: 2, open: 70, close: 72, low: 69, high: 100 }, // bucket: high here
    { timestamp: 3, open: 30, close: 32, low: 10, high: 33 }, // bucket: low here
    { timestamp: 4, open: 40, close: 80, low: 39, high: 81 }, // bucket end
    { timestamp: 5, open: 90, close: 92, low: 89, high: 93 }, // last - preserved
  ];

  const result = ohlcSample(input, 3);
  assertArrayLength('object aggregation', result, 3);

  assertOHLCEqual('object agg first', result[0]!, { timestamp: 0, open: 50, close: 52, low: 49, high: 53 });
  assertOHLCEqual('object agg last', result[2]!, { timestamp: 5, open: 90, close: 92, low: 89, high: 93 });
  assertOHLCEqual('object agg middle', result[1]!, { timestamp: 1, open: 60, close: 80, low: 10, high: 100 });
}

// =============================================================================
// 3. EDGE CASES
// =============================================================================

console.log('[acceptance:ohlc-sample] Testing edge cases...');

// 3.1 targetPoints < 2 returns input as-is (same reference)
{
  const input: OHLCDataPointTuple[] = [
    [0, 100, 102, 99, 103],
    [1, 102, 105, 101, 106],
    [2, 105, 104, 103, 107],
  ];

  const result0 = ohlcSample(input, 0);
  assert(result0 === input, 'targetPoints=0 should return same reference');

  const result1 = ohlcSample(input, 1);
  assert(result1 === input, 'targetPoints=1 should return same reference');

  const resultNeg = ohlcSample(input, -5);
  assert(resultNeg === input, 'targetPoints<0 should return same reference');
}

// 3.2 targetPoints >= data.length returns input as-is (same reference)
{
  const input: OHLCDataPointTuple[] = [
    [0, 100, 102, 99, 103],
    [1, 102, 105, 101, 106],
    [2, 105, 104, 103, 107],
  ];

  const resultEqual = ohlcSample(input, 3);
  assert(resultEqual === input, 'targetPoints=data.length should return same reference');

  const resultGreater = ohlcSample(input, 10);
  assert(resultGreater === input, 'targetPoints>data.length should return same reference');
}

// 3.3 targetPoints === 2 returns [first, last]
{
  const input: OHLCDataPointTuple[] = [
    [0, 100, 102, 99, 103], // first
    [1, 102, 105, 101, 106],
    [2, 105, 104, 103, 107],
    [3, 104, 108, 103, 109],
    [4, 108, 110, 107, 111], // last
  ];

  const result = ohlcSample(input, 2);
  assertArrayLength('targetPoints=2', result, 2);

  assertOHLCEqual('target=2 first', result[0]!, { timestamp: 0, open: 100, close: 102, low: 99, high: 103 });
  assertOHLCEqual('target=2 last', result[1]!, { timestamp: 4, open: 108, close: 110, low: 107, high: 111 });
}

// 3.4 Single data point (edge case, though uncommon)
{
  const inputTuple: OHLCDataPointTuple[] = [[0, 100, 102, 99, 103]];
  const resultTuple = ohlcSample(inputTuple, 5);
  assert(resultTuple === inputTuple, 'single data point should return same reference');

  const inputObject: OHLCDataPointObject[] = [{ timestamp: 0, open: 100, close: 102, low: 99, high: 103 }];
  const resultObject = ohlcSample(inputObject, 5);
  assert(resultObject === inputObject, 'single data point (object) should return same reference');
}

// 3.5 Two data points with target=2
{
  const input: OHLCDataPointTuple[] = [
    [0, 100, 102, 99, 103],
    [1, 105, 107, 104, 108],
  ];

  const result = ohlcSample(input, 2);
  assert(result === input, 'two data points with target=2 should return same reference');
}

// 3.6 Endpoint preservation with exact reference check
{
  const first: OHLCDataPointTuple = [0, 100, 102, 99, 103];
  const last: OHLCDataPointTuple = [4, 108, 110, 107, 111];

  const input: OHLCDataPointTuple[] = [
    first,
    [1, 102, 105, 101, 106],
    [2, 105, 104, 103, 107],
    [3, 104, 108, 103, 109],
    last,
  ];

  const result = ohlcSample(input, 3);

  // Per documentation: "First and last candles are always preserved exactly (same element references)"
  assert(result[0] === first, 'first candle should be same reference');
  assert(result[result.length - 1] === last, 'last candle should be same reference');
}

// 3.7 Multiple buckets with varying extrema
{
  const input: OHLCDataPointTuple[] = [
    [0, 10, 12, 9, 13], // first
    [1, 20, 22, 19, 23], // bucket 1 start
    [2, 30, 32, 29, 33],
    [3, 40, 42, 39, 43], // bucket 1 end
    [4, 50, 52, 49, 53], // bucket 2 start
    [5, 60, 62, 59, 200], // bucket 2: high extrema
    [6, 70, 72, 1, 73], // bucket 2: low extrema
    [7, 80, 82, 79, 83], // bucket 2 end
    [8, 90, 92, 89, 93], // last
  ];

  const result = ohlcSample(input, 4);
  assertArrayLength('multi-bucket', result, 4);

  // First and last
  assertOHLCEqual('multi first', result[0]!, { timestamp: 0, open: 10, close: 12, low: 9, high: 13 });
  assertOHLCEqual('multi last', result[3]!, { timestamp: 8, open: 90, close: 92, low: 89, high: 93 });

  // Bucket 1 (indices 1-3): timestamp=1, open=20, close=42, low=min(19,29,39)=19, high=max(23,33,43)=43
  assertOHLCEqual('multi bucket1', result[1]!, { timestamp: 1, open: 20, close: 42, low: 19, high: 43 });

  // Bucket 2 (indices 4-7): timestamp=4, open=50, close=82, low=min(49,59,1,79)=1, high=max(53,200,73,83)=200
  assertOHLCEqual('multi bucket2', result[2]!, { timestamp: 4, open: 50, close: 82, low: 1, high: 200 });
}

// =============================================================================
// SUCCESS
// =============================================================================

console.log('[acceptance:ohlc-sample] ✓ All tests passed');
console.log('[acceptance:ohlc-sample] Coverage:');
console.log('  - Tuple input format');
console.log('  - Object input format');
console.log('  - Endpoint preservation (values + references)');
console.log('  - OHLC aggregation rules (open=first, close=last, high=max, low=min)');
console.log('  - Edge cases: targetPoints < 2, targetPoints >= data.length, targetPoints === 2');
console.log('  - Single data point, two data points');
console.log('  - Multiple buckets with varying extrema');
