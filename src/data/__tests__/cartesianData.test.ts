/**
 * Tests for cartesianData helpers - guards against undefined/null entries.
 */

import { describe, it, expect } from 'vitest';
import { getX, getY, getSize, computeRawBoundsFromCartesianData } from '../cartesianData';
import type { DataPoint } from '../../config/types';

describe('cartesianData - sparse array handling', () => {
  describe('getX', () => {
    it('returns NaN for undefined DataPoint entries', () => {
      const sparseData: DataPoint[] = [
        { x: 1, y: 2 },
        undefined as any,
        { x: 3, y: 4 },
      ];
      
      expect(getX(sparseData, 0)).toBe(1);
      expect(Number.isNaN(getX(sparseData, 1))).toBe(true);
      expect(getX(sparseData, 2)).toBe(3);
    });

    it('returns NaN for null DataPoint entries', () => {
      const invalidData: any = [
        { x: 1, y: 2 },
        null,
        { x: 3, y: 4 },
      ];
      
      expect(getX(invalidData, 0)).toBe(1);
      expect(Number.isNaN(getX(invalidData, 1))).toBe(true);
      expect(getX(invalidData, 2)).toBe(3);
    });

    it('handles tuple format with undefined entries', () => {
      const sparseData: DataPoint[] = [
        [1, 2],
        undefined as any,
        [3, 4],
      ];
      
      expect(getX(sparseData, 0)).toBe(1);
      expect(Number.isNaN(getX(sparseData, 1))).toBe(true);
      expect(getX(sparseData, 2)).toBe(3);
    });
  });

  describe('getY', () => {
    it('returns NaN for undefined DataPoint entries', () => {
      const sparseData: DataPoint[] = [
        { x: 1, y: 2 },
        undefined as any,
        { x: 3, y: 4 },
      ];
      
      expect(getY(sparseData, 0)).toBe(2);
      expect(Number.isNaN(getY(sparseData, 1))).toBe(true);
      expect(getY(sparseData, 2)).toBe(4);
    });

    it('returns NaN for null DataPoint entries', () => {
      const invalidData: any = [
        { x: 1, y: 2 },
        null,
        { x: 3, y: 4 },
      ];
      
      expect(getY(invalidData, 0)).toBe(2);
      expect(Number.isNaN(getY(invalidData, 1))).toBe(true);
      expect(getY(invalidData, 2)).toBe(4);
    });

    it('handles tuple format with undefined entries', () => {
      const sparseData: DataPoint[] = [
        [1, 2],
        undefined as any,
        [3, 4],
      ];
      
      expect(getY(sparseData, 0)).toBe(2);
      expect(Number.isNaN(getY(sparseData, 1))).toBe(true);
      expect(getY(sparseData, 2)).toBe(4);
    });
  });

  describe('getSize', () => {
    it('returns undefined for undefined DataPoint entries', () => {
      const sparseData: DataPoint[] = [
        { x: 1, y: 2, size: 10 },
        undefined as any,
        { x: 3, y: 4, size: 20 },
      ];
      
      expect(getSize(sparseData, 0)).toBe(10);
      expect(getSize(sparseData, 1)).toBeUndefined();
      expect(getSize(sparseData, 2)).toBe(20);
    });

    it('returns undefined for null DataPoint entries', () => {
      const invalidData: any = [
        { x: 1, y: 2, size: 10 },
        null,
        { x: 3, y: 4, size: 20 },
      ];
      
      expect(getSize(invalidData, 0)).toBe(10);
      expect(getSize(invalidData, 1)).toBeUndefined();
      expect(getSize(invalidData, 2)).toBe(20);
    });

    it('handles tuple format with undefined entries', () => {
      const sparseData: DataPoint[] = [
        [1, 2, 10],
        undefined as any,
        [3, 4, 20],
      ];
      
      expect(getSize(sparseData, 0)).toBe(10);
      expect(getSize(sparseData, 1)).toBeUndefined();
      expect(getSize(sparseData, 2)).toBe(20);
    });
  });

  describe('computeRawBoundsFromCartesianData', () => {
    it('skips undefined and null DataPoint entries when computing bounds', () => {
      const sparseData: DataPoint[] = [
        { x: 1, y: 2 },
        undefined as any,
        { x: 3, y: 4 },
        null as any,
        { x: 5, y: 6 },
      ];
      
      const bounds = computeRawBoundsFromCartesianData(sparseData);
      
      expect(bounds).not.toBeNull();
      expect(bounds?.xMin).toBe(1);
      expect(bounds?.xMax).toBe(5);
      expect(bounds?.yMin).toBe(2);
      expect(bounds?.yMax).toBe(6);
    });
  });
});
