/**
 * Tests for zoom helper utilities.
 * Verifies domain calculations, zoom state checks, and coordinate conversions.
 */

import { describe, it, expect } from 'vitest';
import {
  computeVisibleDomain,
  isFullSpanZoom,
  computeBufferedDomain,
  domainValueToPercent,
  percentToDomainValue,
  calculateZoomSpan,
} from '../zoomHelpers';

describe('computeVisibleDomain', () => {
  it('returns full domain when zoom is null', () => {
    const baseDomain = { min: 0, max: 1000 };
    const result = computeVisibleDomain(baseDomain, null);

    expect(result.min).toBe(0);
    expect(result.max).toBe(1000);
    expect(result.spanFraction).toBe(1);
  });

  it('returns full domain when zoom is undefined', () => {
    const baseDomain = { min: 0, max: 1000 };
    const result = computeVisibleDomain(baseDomain);

    expect(result.min).toBe(0);
    expect(result.max).toBe(1000);
    expect(result.spanFraction).toBe(1);
  });

  it('computes visible domain for 50% zoom', () => {
    const baseDomain = { min: 0, max: 1000 };
    const zoomRange = { start: 25, end: 75 };
    const result = computeVisibleDomain(baseDomain, zoomRange);

    expect(result.min).toBe(250);
    expect(result.max).toBe(750);
    expect(result.spanFraction).toBe(0.5);
  });

  it('computes visible domain for start-aligned zoom', () => {
    const baseDomain = { min: 0, max: 1000 };
    const zoomRange = { start: 0, end: 50 };
    const result = computeVisibleDomain(baseDomain, zoomRange);

    expect(result.min).toBe(0);
    expect(result.max).toBe(500);
    expect(result.spanFraction).toBe(0.5);
  });

  it('computes visible domain for end-aligned zoom', () => {
    const baseDomain = { min: 0, max: 1000 };
    const zoomRange = { start: 50, end: 100 };
    const result = computeVisibleDomain(baseDomain, zoomRange);

    expect(result.min).toBe(500);
    expect(result.max).toBe(1000);
    expect(result.spanFraction).toBe(0.5);
  });

  it('handles negative domains', () => {
    const baseDomain = { min: -500, max: 500 };
    const zoomRange = { start: 0, end: 50 };
    const result = computeVisibleDomain(baseDomain, zoomRange);

    expect(result.min).toBe(-500);
    expect(result.max).toBe(0);
    expect(result.spanFraction).toBe(0.5);
  });

  it('handles zero-span domains', () => {
    const baseDomain = { min: 100, max: 100 };
    const zoomRange = { start: 25, end: 75 };
    const result = computeVisibleDomain(baseDomain, zoomRange);

    expect(result.min).toBe(100);
    expect(result.max).toBe(100);
    expect(result.spanFraction).toBe(1);
  });

  it('handles non-finite domain spans', () => {
    const baseDomain = { min: 0, max: Infinity };
    const zoomRange = { start: 25, end: 75 };
    const result = computeVisibleDomain(baseDomain, zoomRange);

    expect(result.min).toBe(0);
    expect(result.max).toBe(Infinity);
    expect(result.spanFraction).toBe(1);
  });

  it('computes correct span fraction for narrow zoom', () => {
    const baseDomain = { min: 0, max: 1000 };
    const zoomRange = { start: 45, end: 55 };
    const result = computeVisibleDomain(baseDomain, zoomRange);

    expect(result.min).toBe(450);
    expect(result.max).toBe(550);
    expect(result.spanFraction).toBe(0.1);
  });
});

describe('isFullSpanZoom', () => {
  it('returns true for null zoom', () => {
    expect(isFullSpanZoom(null)).toBe(true);
  });

  it('returns true for undefined zoom', () => {
    expect(isFullSpanZoom(undefined)).toBe(true);
  });

  it('returns true for exact full span (0-100)', () => {
    expect(isFullSpanZoom({ start: 0, end: 100 })).toBe(true);
  });

  it('returns true for slightly beyond full span (tolerance)', () => {
    expect(isFullSpanZoom({ start: -0.1, end: 100.1 })).toBe(true);
    expect(isFullSpanZoom({ start: -0.5, end: 100.5 })).toBe(true);
  });

  it('returns false for partial zoom', () => {
    expect(isFullSpanZoom({ start: 25, end: 75 })).toBe(false);
  });

  it('returns false for zoom slightly inside full span', () => {
    expect(isFullSpanZoom({ start: 1, end: 99 })).toBe(false);
  });

  it('returns false for start-aligned partial zoom', () => {
    expect(isFullSpanZoom({ start: 0, end: 50 })).toBe(false);
  });

  it('returns false for end-aligned partial zoom', () => {
    expect(isFullSpanZoom({ start: 50, end: 100 })).toBe(false);
  });

  it('returns true for non-finite values', () => {
    expect(isFullSpanZoom({ start: NaN, end: 100 })).toBe(true);
    expect(isFullSpanZoom({ start: 0, end: Infinity })).toBe(true);
  });

  it('applies tolerance correctly at boundaries', () => {
    expect(isFullSpanZoom({ start: 0.5, end: 100 })).toBe(true); // At tolerance
    expect(isFullSpanZoom({ start: 0.6, end: 100 })).toBe(false); // Beyond tolerance
    expect(isFullSpanZoom({ start: 0, end: 99.5 })).toBe(true); // At tolerance
    expect(isFullSpanZoom({ start: 0, end: 99.4 })).toBe(false); // Beyond tolerance
  });
});

describe('computeBufferedDomain', () => {
  it('adds 10% buffer by default', () => {
    const visible = { min: 100, max: 200 };
    const result = computeBufferedDomain(visible);

    expect(result.min).toBe(90);
    expect(result.max).toBe(210);
  });

  it('applies custom buffer percentage', () => {
    const visible = { min: 100, max: 200 };
    const result = computeBufferedDomain(visible, 0.2);

    expect(result.min).toBe(80);
    expect(result.max).toBe(220);
  });

  it('handles zero buffer', () => {
    const visible = { min: 100, max: 200 };
    const result = computeBufferedDomain(visible, 0);

    expect(result.min).toBe(100);
    expect(result.max).toBe(200);
  });

  it('handles negative domains', () => {
    const visible = { min: -100, max: 100 };
    const result = computeBufferedDomain(visible, 0.1);

    expect(result.min).toBe(-120);
    expect(result.max).toBe(120);
  });

  it('handles zero-span domains', () => {
    const visible = { min: 50, max: 50 };
    const result = computeBufferedDomain(visible, 0.1);

    expect(result.min).toBe(50);
    expect(result.max).toBe(50);
  });

  it('handles negative buffer percentage', () => {
    const visible = { min: 100, max: 200 };
    const result = computeBufferedDomain(visible, -0.1);

    // Negative buffer should be treated as absolute value
    expect(result.min).toBe(90);
    expect(result.max).toBe(210);
  });

  it('handles non-finite spans', () => {
    const visible = { min: 0, max: Infinity };
    const result = computeBufferedDomain(visible, 0.1);

    expect(result.min).toBe(0);
    expect(result.max).toBe(Infinity);
  });
});

describe('domainValueToPercent', () => {
  it('converts midpoint to 50%', () => {
    const percent = domainValueToPercent(500, { min: 0, max: 1000 });
    expect(percent).toBe(50);
  });

  it('converts min to 0%', () => {
    const percent = domainValueToPercent(0, { min: 0, max: 1000 });
    expect(percent).toBe(0);
  });

  it('converts max to 100%', () => {
    const percent = domainValueToPercent(1000, { min: 0, max: 1000 });
    expect(percent).toBe(100);
  });

  it('handles negative domains', () => {
    const percent = domainValueToPercent(0, { min: -500, max: 500 });
    expect(percent).toBe(50);
  });

  it('handles values outside domain', () => {
    const percent = domainValueToPercent(1500, { min: 0, max: 1000 });
    expect(percent).toBe(150);
  });

  it('returns 0 for zero-span domains', () => {
    const percent = domainValueToPercent(100, { min: 50, max: 50 });
    expect(percent).toBe(0);
  });

  it('returns 0 for non-finite spans', () => {
    const percent = domainValueToPercent(500, { min: 0, max: Infinity });
    expect(percent).toBe(0);
  });
});

describe('percentToDomainValue', () => {
  it('converts 50% to midpoint', () => {
    const value = percentToDomainValue(50, { min: 0, max: 1000 });
    expect(value).toBe(500);
  });

  it('converts 0% to min', () => {
    const value = percentToDomainValue(0, { min: 0, max: 1000 });
    expect(value).toBe(0);
  });

  it('converts 100% to max', () => {
    const value = percentToDomainValue(100, { min: 0, max: 1000 });
    expect(value).toBe(1000);
  });

  it('handles negative domains', () => {
    const value = percentToDomainValue(50, { min: -500, max: 500 });
    expect(value).toBe(0);
  });

  it('handles percentages outside [0, 100]', () => {
    const value = percentToDomainValue(150, { min: 0, max: 1000 });
    expect(value).toBe(1500);
  });

  it('handles zero-span domains', () => {
    const value = percentToDomainValue(50, { min: 100, max: 100 });
    expect(value).toBe(100);
  });

  it('is inverse of domainValueToPercent', () => {
    const baseDomain = { min: 0, max: 1000 };
    const originalValue = 750;

    const percent = domainValueToPercent(originalValue, baseDomain);
    const recoveredValue = percentToDomainValue(percent, baseDomain);

    expect(recoveredValue).toBeCloseTo(originalValue, 10);
  });
});

describe('calculateZoomSpan', () => {
  it('returns 100 for full window', () => {
    const windowDomain = { min: 0, max: 1000 };
    const baseDomain = { min: 0, max: 1000 };
    const span = calculateZoomSpan(windowDomain, baseDomain);

    expect(span).toBe(100);
  });

  it('returns 50 for half window', () => {
    const windowDomain = { min: 250, max: 750 };
    const baseDomain = { min: 0, max: 1000 };
    const span = calculateZoomSpan(windowDomain, baseDomain);

    expect(span).toBe(50);
  });

  it('returns 25 for quarter window', () => {
    const windowDomain = { min: 0, max: 250 };
    const baseDomain = { min: 0, max: 1000 };
    const span = calculateZoomSpan(windowDomain, baseDomain);

    expect(span).toBe(25);
  });

  it('caps at 100 for window larger than base', () => {
    const windowDomain = { min: -500, max: 1500 };
    const baseDomain = { min: 0, max: 1000 };
    const span = calculateZoomSpan(windowDomain, baseDomain);

    expect(span).toBe(100);
  });

  it('returns 0 for zero window span', () => {
    const windowDomain = { min: 500, max: 500 };
    const baseDomain = { min: 0, max: 1000 };
    const span = calculateZoomSpan(windowDomain, baseDomain);

    expect(span).toBe(0);
  });

  it('returns 100 for zero base span', () => {
    const windowDomain = { min: 100, max: 200 };
    const baseDomain = { min: 50, max: 50 };
    const span = calculateZoomSpan(windowDomain, baseDomain);

    expect(span).toBe(100);
  });

  it('handles negative window spans', () => {
    const windowDomain = { min: 750, max: 250 }; // Reversed
    const baseDomain = { min: 0, max: 1000 };
    const span = calculateZoomSpan(windowDomain, baseDomain);

    expect(span).toBe(0);
  });
});

describe('integration: zoom coordinate conversions', () => {
  it('round-trip domain to percent to domain', () => {
    const baseDomain = { min: -1000, max: 1000 };
    const originalValue = -250;

    const percent = domainValueToPercent(originalValue, baseDomain);
    const recoveredValue = percentToDomainValue(percent, baseDomain);

    expect(recoveredValue).toBeCloseTo(originalValue, 10);
  });

  it('visible domain matches manual calculation', () => {
    const baseDomain = { min: 0, max: 1000 };
    const zoomRange = { start: 20, end: 80 };

    const visible = computeVisibleDomain(baseDomain, zoomRange);

    // Manual calculation:
    // start=20 => min = 0 + (20/100)*1000 = 200
    // end=80 => max = 0 + (80/100)*1000 = 800
    expect(visible.min).toBe(200);
    expect(visible.max).toBe(800);
    expect(visible.spanFraction).toBe(0.6);
  });

  it('buffered domain extends visible domain correctly', () => {
    const baseDomain = { min: 0, max: 1000 };
    const zoomRange = { start: 40, end: 60 };

    const visible = computeVisibleDomain(baseDomain, zoomRange);
    const buffered = computeBufferedDomain(visible, 0.1);

    // Visible: 400-600 (span: 200)
    // Buffer: 10% = 20
    expect(buffered.min).toBe(380);
    expect(buffered.max).toBe(620);
  });
});
