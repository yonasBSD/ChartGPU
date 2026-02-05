/**
 * Tests for interaction helper utilities.
 * Verifies pointer state management, coordinate transformations, and listener patterns.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createPointerState,
  updatePointerFromMouse,
  clearPointer,
  domainToGridX,
  gridToDomainX,
  computeSyncPointer,
  computeEffectivePointer,
  normalizeInteractionX,
  createInteractionXListeners,
  shouldUpdateInteractionX,
} from '../interactionHelpers';
import { createLinearScale } from '../../../../utils/scales';

describe('createPointerState', () => {
  it('creates empty pointer state', () => {
    const state = createPointerState();

    expect(state.source).toBe('mouse');
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
    expect(state.gridX).toBe(0);
    expect(state.gridY).toBe(0);
    expect(state.isInGrid).toBe(false);
    expect(state.hasPointer).toBe(false);
  });
});

describe('updatePointerFromMouse', () => {
  it('updates pointer state with mouse coordinates', () => {
    const state = updatePointerFromMouse(100, 200, 50, 75, true);

    expect(state.source).toBe('mouse');
    expect(state.x).toBe(100);
    expect(state.y).toBe(200);
    expect(state.gridX).toBe(50);
    expect(state.gridY).toBe(75);
    expect(state.isInGrid).toBe(true);
    expect(state.hasPointer).toBe(true);
  });

  it('marks pointer as outside grid when isInGrid is false', () => {
    const state = updatePointerFromMouse(100, 200, 50, 75, false);

    expect(state.isInGrid).toBe(false);
    expect(state.hasPointer).toBe(true); // Still has pointer, just outside grid
  });
});

describe('clearPointer', () => {
  it('clears pointer active flags', () => {
    const prevState = updatePointerFromMouse(100, 200, 50, 75, true);
    const cleared = clearPointer(prevState);

    expect(cleared.source).toBe('mouse'); // Preserves source
    expect(cleared.x).toBe(100); // Preserves coordinates
    expect(cleared.y).toBe(200);
    expect(cleared.gridX).toBe(50);
    expect(cleared.gridY).toBe(75);
    expect(cleared.isInGrid).toBe(false);
    expect(cleared.hasPointer).toBe(false);
  });
});

describe('domainToGridX', () => {
  const xScale = createLinearScale().domain(0, 100).range(0, 800);

  it('converts domain X to grid CSS pixels', () => {
    const gridX = domainToGridX(50, xScale);
    expect(gridX).toBe(400);
  });

  it('handles domain bounds', () => {
    expect(domainToGridX(0, xScale)).toBe(0);
    expect(domainToGridX(100, xScale)).toBe(800);
  });

  it('extrapolates beyond domain', () => {
    const gridX = domainToGridX(150, xScale);
    expect(gridX).toBe(1200);
  });

  it('returns null for non-finite values', () => {
    expect(domainToGridX(NaN, xScale)).toBe(null);
    expect(domainToGridX(Infinity, xScale)).toBe(null);
  });
});

describe('gridToDomainX', () => {
  const xScale = createLinearScale().domain(0, 100).range(0, 800);

  it('converts grid CSS pixels to domain X', () => {
    const domainX = gridToDomainX(400, xScale);
    expect(domainX).toBe(50);
  });

  it('handles range bounds', () => {
    expect(gridToDomainX(0, xScale)).toBe(0);
    expect(gridToDomainX(800, xScale)).toBe(100);
  });

  it('extrapolates beyond range', () => {
    const domainX = gridToDomainX(1200, xScale);
    expect(domainX).toBe(150);
  });

  it('returns null for non-finite values', () => {
    expect(gridToDomainX(NaN, xScale)).toBe(null);
    expect(gridToDomainX(Infinity, xScale)).toBe(null);
  });

  it('is inverse of domainToGridX', () => {
    const originalDomain = 75;
    const gridX = domainToGridX(originalDomain, xScale);
    const recoveredDomain = gridToDomainX(gridX!, xScale);
    expect(recoveredDomain).toBeCloseTo(originalDomain, 10);
  });
});

describe('computeSyncPointer', () => {
  const xScale = createLinearScale().domain(0, 100).range(0, 800);
  const yScale = createLinearScale().domain(0, 100).range(600, 0);
  const scales = { xScale, yScale, plotWidthCss: 800, plotHeightCss: 600 };
  const gridArea = { left: 60, top: 40, width: 800, height: 600 };

  it('computes sync pointer from domain X', () => {
    const pointer = computeSyncPointer(50, scales, gridArea);

    expect(pointer).not.toBe(null);
    expect(pointer!.source).toBe('sync');
    expect(pointer!.gridX).toBe(400); // 50% of 800
    expect(pointer!.gridY).toBe(300); // Midpoint of 600
    expect(pointer!.x).toBe(460); // gridArea.left + gridX
    expect(pointer!.y).toBe(340); // gridArea.top + gridY
    expect(pointer!.isInGrid).toBe(true);
    expect(pointer!.hasPointer).toBe(true);
  });

  it('returns null when interactionX is null', () => {
    const pointer = computeSyncPointer(null, scales, gridArea);
    expect(pointer).toBe(null);
  });

  it('returns null for non-finite domain X', () => {
    expect(computeSyncPointer(NaN, scales, gridArea)).toBe(null);
    expect(computeSyncPointer(Infinity, scales, gridArea)).toBe(null);
  });

  it('marks pointer as outside grid when gridX exceeds bounds', () => {
    const pointer = computeSyncPointer(150, scales, gridArea); // Beyond domain

    expect(pointer).not.toBe(null);
    expect(pointer!.gridX).toBe(1200); // Extrapolated
    expect(pointer!.isInGrid).toBe(false); // Outside grid bounds
    expect(pointer!.hasPointer).toBe(false); // Not active when outside
  });

  it('places Y at midpoint regardless of domain', () => {
    const pointer1 = computeSyncPointer(25, scales, gridArea);
    const pointer2 = computeSyncPointer(75, scales, gridArea);

    expect(pointer1!.gridY).toBe(300); // Always midpoint
    expect(pointer2!.gridY).toBe(300); // Always midpoint
  });
});

describe('computeEffectivePointer', () => {
  const xScale = createLinearScale().domain(0, 100).range(0, 800);
  const yScale = createLinearScale().domain(0, 100).range(600, 0);
  const scales = { xScale, yScale, plotWidthCss: 800, plotHeightCss: 600 };
  const gridArea = { left: 60, top: 40, width: 800, height: 600 };

  it('returns mouse pointer state unchanged for mouse source', () => {
    const mouseState = updatePointerFromMouse(100, 200, 50, 75, true);
    const effective = computeEffectivePointer(mouseState, null, scales, gridArea);

    expect(effective).toEqual(mouseState);
  });

  it('computes synthetic pointer for sync source', () => {
    const syncState = { ...createPointerState(), source: 'sync' as const };
    const effective = computeEffectivePointer(syncState, 50, scales, gridArea);

    expect(effective.source).toBe('sync');
    expect(effective.gridX).toBe(400);
    expect(effective.hasPointer).toBe(true);
  });

  it('returns inactive pointer when scales are null', () => {
    const syncState = { ...createPointerState(), source: 'sync' as const };
    const effective = computeEffectivePointer(syncState, 50, null, gridArea);

    expect(effective.hasPointer).toBe(false);
    expect(effective.isInGrid).toBe(false);
  });

  it('returns inactive pointer when interactionX is null', () => {
    const syncState = { ...createPointerState(), source: 'sync' as const };
    const effective = computeEffectivePointer(syncState, null, scales, gridArea);

    expect(effective.hasPointer).toBe(false);
    expect(effective.isInGrid).toBe(false);
  });
});

describe('normalizeInteractionX', () => {
  it('returns finite numbers unchanged', () => {
    expect(normalizeInteractionX(0)).toBe(0);
    expect(normalizeInteractionX(50)).toBe(50);
    expect(normalizeInteractionX(-100)).toBe(-100);
  });

  it('returns null for null input', () => {
    expect(normalizeInteractionX(null)).toBe(null);
  });

  it('returns null for NaN', () => {
    expect(normalizeInteractionX(NaN)).toBe(null);
  });

  it('returns null for Infinity', () => {
    expect(normalizeInteractionX(Infinity)).toBe(null);
    expect(normalizeInteractionX(-Infinity)).toBe(null);
  });
});

describe('createInteractionXListeners', () => {
  it('adds and emits to listeners', () => {
    const listeners = createInteractionXListeners();
    const callback = vi.fn();

    listeners.add(callback);
    listeners.emit(50, 'test-source');

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(50, 'test-source');
  });

  it('removes listeners', () => {
    const listeners = createInteractionXListeners();
    const callback = vi.fn();

    listeners.add(callback);
    listeners.remove(callback);
    listeners.emit(50, 'test-source');

    expect(callback).not.toHaveBeenCalled();
  });

  it('emits to multiple listeners', () => {
    const listeners = createInteractionXListeners();
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    listeners.add(callback1);
    listeners.add(callback2);
    listeners.emit(50, 'test-source');

    expect(callback1).toHaveBeenCalledOnce();
    expect(callback2).toHaveBeenCalledOnce();
  });

  it('clears all listeners', () => {
    const listeners = createInteractionXListeners();
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    listeners.add(callback1);
    listeners.add(callback2);
    listeners.clear();
    listeners.emit(50, 'test-source');

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();
  });

  it('handles emit with null value', () => {
    const listeners = createInteractionXListeners();
    const callback = vi.fn();

    listeners.add(callback);
    listeners.emit(null);

    expect(callback).toHaveBeenCalledWith(null, undefined);
  });

  it('is safe to remove during emit', () => {
    const listeners = createInteractionXListeners();
    const callback = vi.fn(() => {
      listeners.remove(callback);
    });

    listeners.add(callback);
    listeners.emit(50);
    listeners.emit(60);

    expect(callback).toHaveBeenCalledOnce(); // Only first emit
  });
});

describe('shouldUpdateInteractionX', () => {
  it('returns true when value changes', () => {
    expect(shouldUpdateInteractionX(50, 'source1', 60, 'source1')).toBe(true);
  });

  it('returns true when source changes', () => {
    expect(shouldUpdateInteractionX(50, 'source1', 50, 'source2')).toBe(true);
  });

  it('returns false when neither value nor source changes', () => {
    expect(shouldUpdateInteractionX(50, 'source1', 50, 'source1')).toBe(false);
  });

  it('returns true when both value and source change', () => {
    expect(shouldUpdateInteractionX(50, 'source1', 60, 'source2')).toBe(true);
  });

  it('handles null values', () => {
    expect(shouldUpdateInteractionX(null, 'source1', null, 'source1')).toBe(false);
    expect(shouldUpdateInteractionX(null, 'source1', 50, 'source1')).toBe(true);
    expect(shouldUpdateInteractionX(50, 'source1', null, 'source1')).toBe(true);
  });

  it('handles undefined source', () => {
    expect(shouldUpdateInteractionX(50, undefined, 50, undefined)).toBe(false);
    expect(shouldUpdateInteractionX(50, undefined, 50, 'source1')).toBe(true);
  });
});

describe('integration: coordinate round-trip', () => {
  it('domain -> grid -> domain preserves value', () => {
    const xScale = createLinearScale().domain(-100, 100).range(0, 1000);
    const originalDomain = 42;

    const gridX = domainToGridX(originalDomain, xScale);
    const recoveredDomain = gridToDomainX(gridX!, xScale);

    expect(recoveredDomain).toBeCloseTo(originalDomain, 10);
  });
});

describe('integration: sync pointer workflow', () => {
  it('supports typical sync interaction cycle', () => {
    const xScale = createLinearScale().domain(0, 1000).range(0, 800);
    const yScale = createLinearScale().domain(0, 100).range(600, 0);
    const scales = { xScale, yScale, plotWidthCss: 800, plotHeightCss: 600 };
    const gridArea = { left: 60, top: 40, width: 800, height: 600 };

    // Start with no interaction
    const initialState = createPointerState();
    const listeners = createInteractionXListeners();
    const callback = vi.fn();
    listeners.add(callback);

    // Activate sync mode
    const syncState = { ...initialState, source: 'sync' as const };
    const interactionX = 500; // Domain units

    // Compute effective pointer
    const effective = computeEffectivePointer(syncState, interactionX, scales, gridArea);

    expect(effective.hasPointer).toBe(true);
    expect(effective.isInGrid).toBe(true);
    expect(effective.source).toBe('sync');

    // Emit change
    listeners.emit(interactionX, 'external-chart');
    expect(callback).toHaveBeenCalledWith(500, 'external-chart');

    // Deactivate sync mode
    const cleared = computeEffectivePointer(syncState, null, scales, gridArea);
    expect(cleared.hasPointer).toBe(false);
  });
});
