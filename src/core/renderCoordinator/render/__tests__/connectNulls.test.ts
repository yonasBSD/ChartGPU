import { describe, it, expect } from 'vitest';
import { filterNullGaps, filterGaps } from '../../../../data/cartesianData';
import type { DataPoint, XYArraysData } from '../../../../config/types';

describe('filterNullGaps', () => {
  it('removes null entries from data array', () => {
    const data: (DataPoint | null)[] = [[0, 1], null, [2, 3], null, [4, 5]];
    const result = filterNullGaps(data);
    expect(result).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it('returns unchanged array when no nulls present', () => {
    const data: DataPoint[] = [[0, 1], [1, 2], [2, 3]];
    const result = filterNullGaps(data);
    expect(result).toEqual([[0, 1], [1, 2], [2, 3]]);
  });

  it('handles all-null array', () => {
    const data: (DataPoint | null)[] = [null, null, null];
    const result = filterNullGaps(data);
    expect(result).toEqual([]);
  });

  it('handles empty array', () => {
    const result = filterNullGaps([]);
    expect(result).toEqual([]);
  });

  it('handles object-style DataPoints with nulls', () => {
    const data: (DataPoint | null)[] = [{ x: 0, y: 1 }, null, { x: 2, y: 3 }];
    const result = filterNullGaps(data);
    expect(result).toEqual([{ x: 0, y: 1 }, { x: 2, y: 3 }]);
  });

  it('handles single null entry', () => {
    const data: (DataPoint | null)[] = [null];
    const result = filterNullGaps(data);
    expect(result).toEqual([]);
  });

  it('handles single valid entry', () => {
    const data: (DataPoint | null)[] = [[5, 10]];
    const result = filterNullGaps(data);
    expect(result).toEqual([[5, 10]]);
  });
});

describe('filterGaps', () => {
  it('removes null entries from DataPoint array', () => {
    const data: (DataPoint | null)[] = [[0, 1], null, [2, 3], null, [4, 5]];
    const result = filterGaps(data);
    expect(result).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it('removes NaN entries from XYArraysData (MutableXYColumns format)', () => {
    // This is the exact format produced by cartesianDataToMutableColumns when
    // the source data contains null gap markers. Nulls become NaN pairs.
    const data: XYArraysData = {
      x: [0, 1, 2, NaN, 4, 5],
      y: [10, 20, 30, NaN, 50, 60],
    };
    const result = filterGaps(data);
    expect(result).toEqual([[0, 10], [1, 20], [2, 30], [4, 50], [5, 60]]);
  });

  it('removes entries where only x is NaN from XYArraysData', () => {
    const data: XYArraysData = {
      x: [0, NaN, 2],
      y: [10, 20, 30],
    };
    const result = filterGaps(data);
    expect(result).toEqual([[0, 10], [2, 30]]);
  });

  it('removes entries where only y is NaN from XYArraysData', () => {
    const data: XYArraysData = {
      x: [0, 1, 2],
      y: [10, NaN, 30],
    };
    const result = filterGaps(data);
    expect(result).toEqual([[0, 10], [2, 30]]);
  });

  it('handles XYArraysData with no NaN entries', () => {
    const data: XYArraysData = {
      x: [0, 1, 2],
      y: [10, 20, 30],
    };
    const result = filterGaps(data);
    expect(result).toEqual([[0, 10], [1, 20], [2, 30]]);
  });

  it('handles InterleavedXYData with NaN entries', () => {
    const data = new Float32Array([0, 10, NaN, NaN, 2, 30]);
    const result = filterGaps(data);
    expect(result).toEqual([[0, 10], [2, 30]]);
  });

  it('handles empty DataPoint array', () => {
    const result = filterGaps([]);
    expect(result).toEqual([]);
  });

  it('handles empty XYArraysData', () => {
    const data: XYArraysData = { x: [], y: [] };
    const result = filterGaps(data);
    expect(result).toEqual([]);
  });

  it('reproduces the connectNulls bug scenario: MutableXYColumns with NaN from null conversion', () => {
    // Simulates the exact data flow that caused the bug:
    // Original data: [[0,2],[1,5],[2,3],[3,7],[4,4], null, [6,8],[7,6],[8,9],[9,5],[10,7], null, [12,3],[13,6],[14,4]]
    // After cartesianDataToMutableColumns, nulls become NaN pairs in x/y arrays.
    const data: XYArraysData = {
      x: [0, 1, 2, 3, 4, NaN, 6, 7, 8, 9, 10, NaN, 12, 13, 14],
      y: [2, 5, 3, 7, 4, NaN, 8, 6, 9, 5,  7, NaN,  3,  6,  4],
    };
    const result = filterGaps(data);
    expect(result).toHaveLength(13);
    expect(result).toEqual([
      [0, 2], [1, 5], [2, 3], [3, 7], [4, 4],
      [6, 8], [7, 6], [8, 9], [9, 5], [10, 7],
      [12, 3], [13, 6], [14, 4],
    ]);
  });
});
