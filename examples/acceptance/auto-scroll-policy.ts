// TypeScript-only acceptance checks for auto-scroll policy (pure function).
// This file is excluded from the library build (tsconfig excludes `examples/`).
//
// Intent: validate that auto-scroll policy correctly handles pinned-to-end and panned-away scenarios.

import type { ZoomRange } from '../../src/interaction/createZoomState';

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

/**
 * Pure function implementing auto-scroll policy logic.
 * 
 * Returns the new zoom range after appending data, or null if no change.
 * 
 * @param currentRange - Current zoom range { start, end } in [0, 100]
 * @param prevBaseDomain - Previous base x-domain { min, max }
 * @param prevVisibleDomain - Previous visible x-domain { min, max }
 * @param nextBaseDomain - Next base x-domain { min, max } after append
 * @returns New zoom range or null if no change
 */
function computeAutoScrollRange(
  currentRange: ZoomRange,
  prevBaseDomain: { readonly min: number; readonly max: number },
  prevVisibleDomain: { readonly min: number; readonly max: number },
  nextBaseDomain: { readonly min: number; readonly max: number }
): ZoomRange | null {
  const r = currentRange;
  
  // Pinned-to-end behavior: when end >= 99.5, preserve span and pin end to 100
  if (r.end >= 99.5) {
    const span = r.end - r.start;
    return { start: 100 - span, end: 100 };
  }
  
  // Panned-away behavior: preserve previous visible domain in new coordinate system
  const span = nextBaseDomain.max - nextBaseDomain.min;
  if (!Number.isFinite(span) || span <= 0) {
    return null; // Invalid domain, no change
  }
  
  const nextStart = ((prevVisibleDomain.min - nextBaseDomain.min) / span) * 100;
  const nextEnd = ((prevVisibleDomain.max - nextBaseDomain.min) / span) * 100;
  
  return { start: nextStart, end: nextEnd };
}

// Pinned-to-end: end >= 99.5 should preserve span and pin end to 100
{
  const currentRange: ZoomRange = { start: 80, end: 99.5 };
  const prevBaseDomain = { min: 0, max: 100 };
  const prevVisibleDomain = { min: 80, max: 99.5 };
  const nextBaseDomain = { min: 0, max: 200 }; // Domain doubled
  
  const result = computeAutoScrollRange(currentRange, prevBaseDomain, prevVisibleDomain, nextBaseDomain);
  
  assert(result !== null, 'Expected pinned-to-end to return a range.');
  assert(result.start === 80.5, `Expected start=80.5 (100 - 19.5), got ${result.start}`);
  assert(result.end === 100, `Expected end=100, got ${result.end}`);
}

// Pinned-to-end: edge case at exactly 99.5
{
  const currentRange: ZoomRange = { start: 0, end: 99.5 };
  const result = computeAutoScrollRange(
    currentRange,
    { min: 0, max: 100 },
    { min: 0, max: 99.5 },
    { min: 0, max: 150 }
  );
  
  assert(result !== null, 'Expected pinned-to-end at 99.5 to return a range.');
  assert(result.start === 0.5, `Expected start=0.5, got ${result.start}`);
  assert(result.end === 100, `Expected end=100, got ${result.end}`);
}

// Panned-away: end < 99.5 should preserve visible domain
{
  const currentRange: ZoomRange = { start: 20, end: 40 };
  const prevBaseDomain = { min: 0, max: 100 };
  const prevVisibleDomain = { min: 20, max: 40 }; // User panned to middle
  const nextBaseDomain = { min: 0, max: 200 }; // Domain doubled
  
  const result = computeAutoScrollRange(currentRange, prevBaseDomain, prevVisibleDomain, nextBaseDomain);
  
  assert(result !== null, 'Expected panned-away to return a range.');
  // Visible domain [20, 40] in [0, 100] maps to [20, 40] in [0, 200]
  // Percent: start = (20 - 0) / 200 * 100 = 10, end = (40 - 0) / 200 * 100 = 20
  assert(result.start === 10, `Expected start=10, got ${result.start}`);
  assert(result.end === 20, `Expected end=20, got ${result.end}`);
}

// Panned-away: domain shift (min changes)
{
  const currentRange: ZoomRange = { start: 50, end: 80 };
  const prevBaseDomain = { min: 100, max: 200 };
  const prevVisibleDomain = { min: 150, max: 180 };
  const nextBaseDomain = { min: 150, max: 300 }; // Domain shifted right
  
  const result = computeAutoScrollRange(currentRange, prevBaseDomain, prevVisibleDomain, nextBaseDomain);
  
  assert(result !== null, 'Expected panned-away with domain shift to return a range.');
  // Visible domain [150, 180] in [100, 200] maps to [150, 180] in [150, 300]
  // Percent: start = (150 - 150) / 150 * 100 = 0, end = (180 - 150) / 150 * 100 = 20
  assert(result.start === 0, `Expected start=0, got ${result.start}`);
  assert(result.end === 20, `Expected end=20, got ${result.end}`);
}

// Edge case: zero span domain should return null
{
  const currentRange: ZoomRange = { start: 0, end: 50 };
  const result = computeAutoScrollRange(
    currentRange,
    { min: 0, max: 100 },
    { min: 0, max: 50 },
    { min: 10, max: 10 } // Zero span
  );
  
  assert(result === null, 'Expected zero span domain to return null.');
}

// Edge case: invalid (non-finite) span should return null
{
  const currentRange: ZoomRange = { start: 0, end: 50 };
  const result = computeAutoScrollRange(
    currentRange,
    { min: 0, max: 100 },
    { min: 0, max: 50 },
    { min: Number.POSITIVE_INFINITY, max: Number.POSITIVE_INFINITY }
  );
  
  assert(result === null, 'Expected non-finite span to return null.');
}

// Pinned-to-end: span preservation check
{
  const currentRange: ZoomRange = { start: 90, end: 100 };
  const span = currentRange.end - currentRange.start; // 10
  const result = computeAutoScrollRange(
    currentRange,
    { min: 0, max: 100 },
    { min: 90, max: 100 },
    { min: 0, max: 500 }
  );
  
  assert(result !== null, 'Expected pinned-to-end to return a range.');
  const newSpan = result.end - result.start;
  assert(newSpan === span, `Expected span preservation: ${span}, got ${newSpan}`);
}

console.log('[acceptance:auto-scroll-policy] OK');
