/**
 * Data point packing utilities for GPU buffer uploads.
 * 
 * Internal utilities that convert high-level DataPoint/OHLCDataPoint arrays into
 * interleaved Float32Array buffers suitable for direct GPU buffer uploads via
 * `queue.writeBuffer()`.
 * 
 * @module packDataPoints
 * @internal
 */

import type { DataPoint, DataPointTuple } from '../config/types';

/**
 * Type guard to check if a DataPoint is in tuple form.
 */
function isTupleDataPoint(point: DataPoint): point is DataPointTuple {
  return Array.isArray(point);
}

/**
 * Packs DataPoint array into an interleaved Float32Array for GPU buffer uploads.
 * 
 * **Internal utility** used by data store for efficient GPU buffer management.
 * 
 * **Format**: `[x0, y0, x1, y1, x2, y2, ...]` (2 floats per point = 8 bytes stride)
 * 
 * @param points - Array of data points (tuple or object form)
 * @returns Interleaved Float32Array [x0,y0,x1,y1,...] for GPU vertex buffer upload
 * @throws {TypeError} If points is null, undefined, or not an array
 * @throws {RangeError} If points array is empty or contains invalid values
 * @internal
 * 
 * @example
 * ```typescript
 * const points = [{ x: 0, y: 10 }, { x: 1, y: 20 }];
 * const packed = packDataPoints(points);
 * // packed = Float32Array[0, 10, 1, 20]
 * 
 * // Upload to GPU buffer:
 * device.queue.writeBuffer(vertexBuffer, 0, packed.buffer);
 * ```
 */
export function packDataPoints(points: ReadonlyArray<DataPoint>): Float32Array {
  // Input validation
  if (!points) {
    throw new TypeError('packDataPoints: points parameter is required');
  }
  
  if (!Array.isArray(points)) {
    throw new TypeError('packDataPoints: points must be an array');
  }
  
  if (points.length === 0) {
    // Return empty array for empty input (valid case)
    return new Float32Array(0);
  }
  
  // Validate array length doesn't exceed safe limits
  // Max safe array size: ~2GB / 8 bytes = 268M points
  const MAX_POINTS = 268_435_456; // 2^28 points = 2GB buffer
  if (points.length > MAX_POINTS) {
    throw new RangeError(
      `packDataPoints: points array too large (${points.length} points). ` +
      `Maximum supported: ${MAX_POINTS.toLocaleString()} points (2GB buffer limit)`
    );
  }

  // Allocate buffer: 2 floats per point × 4 bytes per float = 8 bytes per point
  const buffer = new ArrayBuffer(points.length * 2 * 4);
  const f32 = new Float32Array(buffer);

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    
    // Validate point is not null/undefined
    if (point === null || point === undefined) {
      throw new TypeError(
        `packDataPoints: Invalid point at index ${i}. ` +
        `Expected DataPoint (tuple or object), got ${point}`
      );
    }
    
    const x = isTupleDataPoint(point) ? point[0] : point.x;
    const y = isTupleDataPoint(point) ? point[1] : point.y;
    
    // Validate numeric values (catches NaN, undefined properties)
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new TypeError(
        `packDataPoints: Invalid coordinate values at index ${i}. ` +
        `Expected numbers, got x=${typeof x}, y=${typeof y}`
      );
    }
    
    // Note: NaN and Infinity are valid Float32 values and will be preserved
    // If you need to reject them, add additional checks here
    
    f32[i * 2 + 0] = x;
    f32[i * 2 + 1] = y;
  }

  return f32;
}
