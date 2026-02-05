/**
 * Tooltip and legend helper utilities.
 *
 * Provides utilities for managing tooltip state, caching content to avoid
 * unnecessary DOM updates, and computing tooltip anchor positions for special
 * chart types like candlesticks.
 *
 * @module tooltipLegendHelpers
 */

import type { OHLCDataPoint } from '../../../config/types';
import type { LinearScale } from '../../../utils/scales';
import { clipXToCanvasCssPx, clipYToCanvasCssPx } from '../utils/axisUtils';
import { isTupleOHLCDataPoint } from '../utils/dataPointUtils';

/**
 * Tooltip anchor position in canvas-local CSS pixels.
 */
export interface TooltipAnchor {
  readonly x: number;
  readonly y: number;
}

/**
 * Cached tooltip state for content deduplication.
 *
 * Tracks the last displayed content and position to avoid unnecessary DOM updates
 * when the tooltip hasn't actually changed.
 */
export interface TooltipCache {
  content: string | null;
  x: number | null;
  y: number | null;
}

/**
 * Creates a new empty tooltip cache.
 *
 * @returns Fresh tooltip cache with null values
 */
export function createTooltipCache(): TooltipCache {
  return {
    content: null,
    x: null,
    y: null,
  };
}

/**
 * Checks if tooltip content or position has changed.
 *
 * Returns true if any of the values differ from the cache, indicating that
 * a DOM update is needed.
 *
 * @param cache - Current cached state
 * @param content - New content to display
 * @param x - New X position in CSS pixels
 * @param y - New Y position in CSS pixels
 * @returns True if update is needed (values differ from cache)
 */
export function shouldUpdateTooltip(
  cache: TooltipCache,
  content: string,
  x: number,
  y: number
): boolean {
  return cache.content !== content || cache.x !== x || cache.y !== y;
}

/**
 * Updates the tooltip cache with new values.
 *
 * Should be called after successfully updating the DOM to keep cache in sync.
 *
 * @param cache - Tooltip cache to update (mutated)
 * @param content - New content that was displayed
 * @param x - New X position that was set
 * @param y - New Y position that was set
 */
export function updateTooltipCache(
  cache: TooltipCache,
  content: string,
  x: number,
  y: number
): void {
  cache.content = content;
  cache.x = x;
  cache.y = y;
}

/**
 * Clears the tooltip cache.
 *
 * Should be called when the tooltip is hidden to ensure fresh state
 * when it's shown again.
 *
 * @param cache - Tooltip cache to clear (mutated)
 */
export function clearTooltipCache(cache: TooltipCache): void {
  cache.content = null;
  cache.x = null;
  cache.y = null;
}

/**
 * Computes container-local CSS pixel anchor coordinates for a candlestick tooltip.
 *
 * The anchor is positioned near the candle body center for stable tooltip positioning
 * even when the cursor is at the edge of the candlestick.
 *
 * Coordinate transformations:
 * 1. Extract O/H/L/C from data point (tuple: [timestamp, open, close, low, high])
 * 2. Compute body center Y = (open + close) / 2
 * 3. Transform to clip space via scales
 * 4. Convert clip space to canvas-local CSS pixels
 * 5. Add container offset for absolute positioning
 *
 * Returns null if any coordinate computation fails (non-finite values).
 *
 * @param point - OHLC data point (tuple or object format)
 * @param xScale - Linear scale for X axis
 * @param yScale - Linear scale for Y axis
 * @param canvasCssWidth - Canvas width in CSS pixels
 * @param canvasCssHeight - Canvas height in CSS pixels
 * @param offsetX - Container offset X in CSS pixels (default: 0)
 * @param offsetY - Container offset Y in CSS pixels (default: 0)
 * @returns Tooltip anchor position or null if computation fails
 */
export function computeCandlestickTooltipAnchor(
  point: OHLCDataPoint,
  xScale: LinearScale,
  yScale: LinearScale,
  canvasCssWidth: number,
  canvasCssHeight: number,
  offsetX: number = 0,
  offsetY: number = 0
): TooltipAnchor | null {
  // Extract coordinates from data point (supports both tuple and object formats)
  let timestamp: number;
  let open: number;
  let close: number;

  if (isTupleOHLCDataPoint(point)) {
    // Tuple format: [timestamp, open, close, low, high]
    [timestamp, open, close] = point;
  } else {
    // Object format: { timestamp, open, close, low, high }
    timestamp = point.timestamp;
    open = point.open;
    close = point.close;
  }

  // Validate extracted values
  if (!Number.isFinite(timestamp) || !Number.isFinite(open) || !Number.isFinite(close)) {
    return null;
  }

  // Compute body center Y coordinate
  const bodyCenterY = (open + close) / 2;

  // Transform to clip space
  const xClip = xScale.scale(timestamp);
  const yClip = yScale.scale(bodyCenterY);

  // Convert to canvas-local CSS pixels
  const xCss = clipXToCanvasCssPx(xClip, canvasCssWidth);
  const yCss = clipYToCanvasCssPx(yClip, canvasCssHeight);

  // Validate computed coordinates
  if (!Number.isFinite(xCss) || !Number.isFinite(yCss)) {
    return null;
  }

  // Add container offset for absolute positioning
  return {
    x: offsetX + xCss,
    y: offsetY + yCss,
  };
}

/**
 * Determines if a data point is an OHLC/candlestick point.
 *
 * Checks if the point is a 5-element tuple (timestamp, open, close, low, high)
 * or an object with OHLC properties.
 *
 * @param point - Data point to check
 * @returns True if point is OHLC format
 */
export function isOHLCDataPoint(point: any): point is OHLCDataPoint {
  if (Array.isArray(point)) {
    return point.length === 5;
  }
  if (point && typeof point === 'object') {
    return (
      'timestamp' in point &&
      'open' in point &&
      'close' in point &&
      'low' in point &&
      'high' in point
    );
  }
  return false;
}
