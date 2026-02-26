import { describe, it, expect } from 'vitest';
import { filterNullGaps } from '../../../../data/cartesianData';
import type { DataPoint } from '../../../../config/types';

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
