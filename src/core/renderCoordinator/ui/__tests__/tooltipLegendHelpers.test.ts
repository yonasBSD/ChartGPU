/**
 * Tests for tooltip and legend helper utilities.
 * Verifies caching logic, anchor positioning, and type guards.
 */

import { describe, it, expect } from 'vitest';
import {
  createTooltipCache,
  shouldUpdateTooltip,
  updateTooltipCache,
  clearTooltipCache,
  computeCandlestickTooltipAnchor,
  isOHLCDataPoint,
} from '../tooltipLegendHelpers';
import { createLinearScale } from '../../../../utils/scales';

describe('createTooltipCache', () => {
  it('creates cache with null values', () => {
    const cache = createTooltipCache();

    expect(cache.content).toBe(null);
    expect(cache.x).toBe(null);
    expect(cache.y).toBe(null);
  });
});

describe('shouldUpdateTooltip', () => {
  it('returns true when content changes', () => {
    const cache = createTooltipCache();
    cache.content = 'Old content';
    cache.x = 100;
    cache.y = 200;

    const result = shouldUpdateTooltip(cache, 'New content', 100, 200);

    expect(result).toBe(true);
  });

  it('returns true when X position changes', () => {
    const cache = createTooltipCache();
    cache.content = 'Content';
    cache.x = 100;
    cache.y = 200;

    const result = shouldUpdateTooltip(cache, 'Content', 150, 200);

    expect(result).toBe(true);
  });

  it('returns true when Y position changes', () => {
    const cache = createTooltipCache();
    cache.content = 'Content';
    cache.x = 100;
    cache.y = 200;

    const result = shouldUpdateTooltip(cache, 'Content', 100, 250);

    expect(result).toBe(true);
  });

  it('returns false when nothing changes', () => {
    const cache = createTooltipCache();
    cache.content = 'Content';
    cache.x = 100;
    cache.y = 200;

    const result = shouldUpdateTooltip(cache, 'Content', 100, 200);

    expect(result).toBe(false);
  });

  it('returns true when cache is empty', () => {
    const cache = createTooltipCache();

    const result = shouldUpdateTooltip(cache, 'Content', 100, 200);

    expect(result).toBe(true);
  });

  it('returns true when multiple values change', () => {
    const cache = createTooltipCache();
    cache.content = 'Old';
    cache.x = 100;
    cache.y = 200;

    const result = shouldUpdateTooltip(cache, 'New', 150, 250);

    expect(result).toBe(true);
  });
});

describe('updateTooltipCache', () => {
  it('updates all cache values', () => {
    const cache = createTooltipCache();

    updateTooltipCache(cache, 'New content', 150, 250);

    expect(cache.content).toBe('New content');
    expect(cache.x).toBe(150);
    expect(cache.y).toBe(250);
  });

  it('overwrites previous values', () => {
    const cache = createTooltipCache();
    cache.content = 'Old';
    cache.x = 100;
    cache.y = 200;

    updateTooltipCache(cache, 'New', 150, 250);

    expect(cache.content).toBe('New');
    expect(cache.x).toBe(150);
    expect(cache.y).toBe(250);
  });
});

describe('clearTooltipCache', () => {
  it('clears all cache values to null', () => {
    const cache = createTooltipCache();
    cache.content = 'Content';
    cache.x = 100;
    cache.y = 200;

    clearTooltipCache(cache);

    expect(cache.content).toBe(null);
    expect(cache.x).toBe(null);
    expect(cache.y).toBe(null);
  });

  it('is idempotent', () => {
    const cache = createTooltipCache();
    cache.content = 'Content';

    clearTooltipCache(cache);
    clearTooltipCache(cache);

    expect(cache.content).toBe(null);
    expect(cache.x).toBe(null);
    expect(cache.y).toBe(null);
  });
});

describe('computeCandlestickTooltipAnchor', () => {
  const xScale = createLinearScale().domain(0, 100).range(-1, 1);
  const yScale = createLinearScale().domain(0, 100).range(1, -1);
  const canvasCssWidth = 800;
  const canvasCssHeight = 600;

  it('computes anchor for tuple OHLC data point', () => {
    const point: [number, number, number, number, number] = [50, 80, 90, 70, 95];
    const anchor = computeCandlestickTooltipAnchor(point, xScale, yScale, canvasCssWidth, canvasCssHeight);

    expect(anchor).not.toBe(null);
    expect(anchor!.x).toBeGreaterThan(0);
    expect(anchor!.y).toBeGreaterThan(0);
  });

  it('computes anchor at body center Y', () => {
    const point: [number, number, number, number, number] = [50, 80, 90, 70, 95];
    // Body center Y = (open + close) / 2 = (80 + 90) / 2 = 85
    const anchor = computeCandlestickTooltipAnchor(point, xScale, yScale, canvasCssWidth, canvasCssHeight);

    expect(anchor).not.toBe(null);
    // X should be at 50% of canvas width (x=50 in domain [0,100])
    expect(anchor!.x).toBeCloseTo(canvasCssWidth / 2, 0);
    // Y coordinate depends on scale transformation
    expect(anchor!.y).toBeGreaterThan(0);
    expect(anchor!.y).toBeLessThan(canvasCssHeight);
  });

  it('computes anchor for object OHLC data point', () => {
    const point = { timestamp: 50, open: 80, close: 90, low: 70, high: 95 };
    const anchor = computeCandlestickTooltipAnchor(point, xScale, yScale, canvasCssWidth, canvasCssHeight);

    expect(anchor).not.toBe(null);
    expect(anchor!.x).toBeGreaterThan(0);
    expect(anchor!.y).toBeGreaterThan(0);
  });

  it('applies container offset', () => {
    const point: [number, number, number, number, number] = [50, 80, 90, 70, 95];
    const offsetX = 100;
    const offsetY = 50;
    const anchor = computeCandlestickTooltipAnchor(
      point,
      xScale,
      yScale,
      canvasCssWidth,
      canvasCssHeight,
      offsetX,
      offsetY
    );

    expect(anchor).not.toBe(null);
    expect(anchor!.x).toBeGreaterThan(offsetX);
    expect(anchor!.y).toBeGreaterThan(offsetY);
  });

  it('returns null for non-finite X', () => {
    const point: [number, number, number, number, number] = [NaN, 80, 90, 70, 95];
    const anchor = computeCandlestickTooltipAnchor(point, xScale, yScale, canvasCssWidth, canvasCssHeight);

    expect(anchor).toBe(null);
  });

  it('returns null for non-finite open', () => {
    const point: [number, number, number, number, number] = [50, NaN, 90, 70, 95];
    const anchor = computeCandlestickTooltipAnchor(point, xScale, yScale, canvasCssWidth, canvasCssHeight);

    expect(anchor).toBe(null);
  });

  it('returns null for non-finite close', () => {
    const point: [number, number, number, number, number] = [50, 80, Infinity, 70, 95];
    const anchor = computeCandlestickTooltipAnchor(point, xScale, yScale, canvasCssWidth, canvasCssHeight);

    expect(anchor).toBe(null);
  });

  it('handles zero container offset', () => {
    const point: [number, number, number, number, number] = [50, 80, 90, 70, 95];
    const anchor = computeCandlestickTooltipAnchor(point, xScale, yScale, canvasCssWidth, canvasCssHeight, 0, 0);

    expect(anchor).not.toBe(null);
    expect(anchor!.x).toBeGreaterThan(0);
    expect(anchor!.y).toBeGreaterThan(0);
  });

  it('handles different scales', () => {
    const customXScale = createLinearScale().domain(0, 1000).range(-1, 1);
    const customYScale = createLinearScale().domain(0, 200).range(1, -1);
    const point: [number, number, number, number, number] = [500, 100, 120, 90, 130];

    const anchor = computeCandlestickTooltipAnchor(point, customXScale, customYScale, canvasCssWidth, canvasCssHeight);

    expect(anchor).not.toBe(null);
    expect(anchor!.x).toBeCloseTo(canvasCssWidth / 2, 0);
  });
});

describe('isOHLCDataPoint', () => {
  it('returns true for 5-element tuple', () => {
    const point: [number, number, number, number, number] = [1, 2, 3, 4, 5];
    expect(isOHLCDataPoint(point)).toBe(true);
  });

  it('returns false for 2-element tuple', () => {
    const point = [1, 2];
    expect(isOHLCDataPoint(point)).toBe(false);
  });

  it('returns false for 4-element tuple', () => {
    const point = [1, 2, 3, 4];
    expect(isOHLCDataPoint(point)).toBe(false);
  });

  it('returns true for object with OHLC properties', () => {
    const point = { timestamp: 1, open: 2, close: 3, low: 4, high: 5 };
    expect(isOHLCDataPoint(point)).toBe(true);
  });

  it('returns false for object missing OHLC properties', () => {
    const point = { x: 1, y: 2 };
    expect(isOHLCDataPoint(point)).toBe(false);
  });

  it('returns false for object with partial OHLC properties', () => {
    const point = { x: 1, open: 2, close: 3 };
    expect(isOHLCDataPoint(point)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isOHLCDataPoint(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isOHLCDataPoint(undefined)).toBe(false);
  });

  it('returns false for number', () => {
    expect(isOHLCDataPoint(123)).toBe(false);
  });

  it('returns false for string', () => {
    expect(isOHLCDataPoint('data')).toBe(false);
  });
});

describe('integration: tooltip cache workflow', () => {
  it('supports typical show/hide/update cycle', () => {
    const cache = createTooltipCache();

    // Initial show
    expect(shouldUpdateTooltip(cache, 'Content 1', 100, 200)).toBe(true);
    updateTooltipCache(cache, 'Content 1', 100, 200);

    // No change
    expect(shouldUpdateTooltip(cache, 'Content 1', 100, 200)).toBe(false);

    // Position change
    expect(shouldUpdateTooltip(cache, 'Content 1', 150, 200)).toBe(true);
    updateTooltipCache(cache, 'Content 1', 150, 200);

    // Hide
    clearTooltipCache(cache);

    // Show again
    expect(shouldUpdateTooltip(cache, 'Content 2', 100, 200)).toBe(true);
    updateTooltipCache(cache, 'Content 2', 100, 200);
  });

  it('prevents unnecessary DOM updates', () => {
    const cache = createTooltipCache();
    updateTooltipCache(cache, 'Same content', 100, 200);

    // Simulate repeated render with same state
    for (let i = 0; i < 10; i++) {
      expect(shouldUpdateTooltip(cache, 'Same content', 100, 200)).toBe(false);
    }
  });
});
