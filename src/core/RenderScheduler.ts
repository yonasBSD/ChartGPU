/**
 * RenderScheduler - 60fps render loop management
 * 
 * Manages a requestAnimationFrame-based render loop that runs at 60fps,
 * providing delta time tracking and frame scheduling control.
 * 
 * This module provides both functional and class-based APIs for maximum flexibility.
 * The functional API is preferred for better type safety and immutability.
 */

/**
 * Callback function type for render frames.
 * Receives delta time in milliseconds since the last frame.
 */
export type RenderCallback = (deltaTime: number) => void;

import type { ExactFPS, Milliseconds, FrameTimeStats, FrameDropStats } from '../config/types';

/**
 * Represents the state of a render scheduler.
 * All properties are readonly to ensure immutability.
 */
export interface RenderSchedulerState {
  readonly id: symbol;
  readonly running: boolean;
}

/**
 * Circular buffer for frame timestamps (120 frames = 2 seconds at 60fps).
 * Uses Float64Array for high-precision timestamps from performance.now().
 */
const FRAME_BUFFER_SIZE = 120;

/**
 * Expected frame time at 60fps (16.67ms).
 * Used for frame drop detection.
 */
const EXPECTED_FRAME_TIME_MS = 1000 / 60;

/**
 * Frame drop threshold multiplier (1.5x expected frame time).
 * Frame times exceeding this are counted as drops.
 */
const FRAME_DROP_THRESHOLD_MULTIPLIER = 1.5;

/**
 * Internal mutable state for the render scheduler.
 * Stored separately from the public state interface.
 */
interface RenderSchedulerInternalState {
  rafId: number | null;
  callback: RenderCallback | null;
  lastFrameTime: number;
  dirty: boolean;
  frameHandler: ((time: number) => void) | null;
  
  // Performance tracking
  frameTimestamps: Float64Array;
  frameTimestampIndex: number;
  frameTimestampCount: number;
  totalFrames: number;
  totalDroppedFrames: number;
  consecutiveDroppedFrames: number;
  lastDropTimestamp: number;
  startTime: number;
}

/**
 * Map to store internal mutable state for each scheduler state instance.
 * Keyed by the state's unique ID symbol.
 */
const internalStateMap = new Map<symbol, RenderSchedulerInternalState>();

/**
 * Creates a new RenderScheduler state with initial values.
 * 
 * @returns A new RenderSchedulerState instance
 */
export function createRenderScheduler(): RenderSchedulerState {
  const id = Symbol('RenderScheduler');
  const state: RenderSchedulerState = {
    id,
    running: false,
  };

  // Initialize internal mutable state
  internalStateMap.set(id, {
    rafId: null,
    callback: null,
    lastFrameTime: 0,
    dirty: false,
    frameHandler: null,
    
    // Performance tracking
    frameTimestamps: new Float64Array(FRAME_BUFFER_SIZE),
    frameTimestampIndex: 0,
    frameTimestampCount: 0,
    totalFrames: 0,
    totalDroppedFrames: 0,
    consecutiveDroppedFrames: 0,
    lastDropTimestamp: 0,
    startTime: performance.now(),
  });

  return state;
}

/**
 * Starts the render loop.
 * 
 * Begins a requestAnimationFrame loop that calls the provided callback
 * every frame with the delta time in milliseconds since the last frame.
 * Returns a new state object with running set to true.
 * 
 * @param state - The scheduler state to start
 * @param callback - Function to call each frame with delta time
 * @returns A new RenderSchedulerState with running set to true
 * @throws {Error} If callback is not provided
 * @throws {Error} If scheduler is already running
 * @throws {Error} If state is invalid
 */
export function startRenderScheduler(
  state: RenderSchedulerState,
  callback: RenderCallback
): RenderSchedulerState {
  if (!callback) {
    throw new Error('Render callback is required');
  }

  const internalState = internalStateMap.get(state.id);
  if (!internalState) {
    throw new Error('Invalid scheduler state. Use createRenderScheduler() to create a new state.');
  }

  if (state.running) {
    throw new Error('RenderScheduler is already running. Call stopRenderScheduler() before starting again.');
  }

  // Update internal state
  internalState.callback = callback;
  internalState.lastFrameTime = performance.now();
  internalState.dirty = true;

  const schedulerId = state.id;
  const frameHandler = (currentTime: number) => {
    // Look up internal state - may be null if scheduler was destroyed
    const currentInternalState = internalStateMap.get(schedulerId);
    if (!currentInternalState || !currentInternalState.callback) {
      // Scheduler was stopped or destroyed, exit gracefully
      return;
    }

    // Clear rafId at the start - we are no longer scheduled (now idle)
    currentInternalState.rafId = null;

    // Record frame timestamp in circular buffer BEFORE rendering
    // Use performance.now() exclusively for exact FPS measurement
    const timestamp = performance.now();
    currentInternalState.frameTimestamps[currentInternalState.frameTimestampIndex] = timestamp;
    currentInternalState.frameTimestampIndex = (currentInternalState.frameTimestampIndex + 1) % FRAME_BUFFER_SIZE;
    if (currentInternalState.frameTimestampCount < FRAME_BUFFER_SIZE) {
      currentInternalState.frameTimestampCount++;
    }
    currentInternalState.totalFrames++;

    // Calculate deltaTime with capping to prevent animation jumps after idle
    let deltaTime = currentTime - currentInternalState.lastFrameTime;
    // Cap deltaTime to 100ms (1/10th second) to prevent huge jumps
    const MAX_DELTA_TIME = 100;
    if (deltaTime > MAX_DELTA_TIME) {
      deltaTime = MAX_DELTA_TIME;
    }

    // Frame drop detection (only after first frame)
    if (currentInternalState.lastFrameTime > 0 && deltaTime > EXPECTED_FRAME_TIME_MS * FRAME_DROP_THRESHOLD_MULTIPLIER) {
      currentInternalState.totalDroppedFrames++;
      currentInternalState.consecutiveDroppedFrames++;
      currentInternalState.lastDropTimestamp = timestamp;
    } else if (currentInternalState.lastFrameTime > 0) {
      // Reset consecutive counter on successful frame
      currentInternalState.consecutiveDroppedFrames = 0;
    }

    currentInternalState.lastFrameTime = currentTime;

    // Only render if dirty
    if (currentInternalState.dirty) {
      // Reset dirty flag BEFORE calling callback
      currentInternalState.dirty = false;

      // Call the render callback with delta time
      currentInternalState.callback(deltaTime);

      // After callback returns, check if dirty was set again (callback-triggered renders for animations)
      // Re-check internal state in case it was destroyed during callback execution
      const nextInternalState = internalStateMap.get(schedulerId);
      if (nextInternalState && nextInternalState.callback && nextInternalState.dirty) {
        // Schedule another frame since callback requested a render
        nextInternalState.rafId = requestAnimationFrame(frameHandler);
      }
    }
    // If not dirty, we remain idle (rafId stays null, no frame scheduled)
  };

  // Store frameHandler in internal state so requestRender() can access it
  internalState.frameHandler = frameHandler;

  // Start the first frame
  internalState.rafId = requestAnimationFrame(frameHandler);

  // Return new state with running set to true
  return {
    id: state.id,
    running: true,
  };
}

/**
 * Stops the render loop.
 * 
 * Cancels any pending requestAnimationFrame calls and stops the loop.
 * Returns a new state object with running set to false.
 * The scheduler can be restarted by calling startRenderScheduler() again.
 * 
 * @param state - The scheduler state to stop
 * @returns A new RenderSchedulerState with running set to false
 * @throws {Error} If state is invalid
 */
export function stopRenderScheduler(state: RenderSchedulerState): RenderSchedulerState {
  const internalState = internalStateMap.get(state.id);
  if (!internalState) {
    throw new Error('Invalid scheduler state. Use createRenderScheduler() to create a new state.');
  }

  internalState.callback = null;
  internalState.frameHandler = null;

  if (internalState.rafId !== null) {
    cancelAnimationFrame(internalState.rafId);
    internalState.rafId = null;
  }

  // Return new state with running set to false
  return {
    id: state.id,
    running: false,
  };
}

/**
 * Marks the current frame as dirty and schedules a render if idle.
 * 
 * This function implements render-on-demand: it schedules a frame when the
 * scheduler is idle. Multiple calls coalesce into a single frame.
 * 
 * @param state - The scheduler state
 * @throws {Error} If state is invalid
 */
export function requestRender(state: RenderSchedulerState): void {
  const internalState = internalStateMap.get(state.id);
  if (!internalState) {
    throw new Error('Invalid scheduler state. Use createRenderScheduler() to create a new state.');
  }

  // Mark as dirty
  internalState.dirty = true;

  // If not running, return early
  if (internalState.callback === null) {
    return;
  }

  // If already scheduled, return early (coalescing)
  if (internalState.rafId !== null) {
    return;
  }

  // Idle - schedule a frame
  // Reset lastFrameTime to current time to ensure reasonable deltaTime after idle
  internalState.lastFrameTime = performance.now();
  
  // Schedule RAF using the stored frameHandler
  if (internalState.frameHandler) {
    internalState.rafId = requestAnimationFrame(internalState.frameHandler);
  }
}

/**
 * Calculates exact FPS from frame timestamp deltas.
 * 
 * Uses the circular buffer of performance.now() timestamps to calculate
 * frame-perfect FPS. Algorithm:
 * 1. Sum all frame time deltas in the buffer
 * 2. Divide by (count - 1) to get average frame time
 * 3. Convert to FPS: 1000ms / avg_frame_time
 * 
 * Returns 0 if insufficient data (< 2 frames).
 * 
 * @param state - The scheduler state
 * @returns Exact FPS measurement
 */
export function getCurrentFPS(state: RenderSchedulerState): ExactFPS {
  const internalState = internalStateMap.get(state.id);
  if (!internalState) {
    return 0 as ExactFPS;
  }

  const count = internalState.frameTimestampCount;
  if (count < 2) {
    return 0 as ExactFPS; // Need at least 2 frames to calculate FPS
  }

  // Calculate sum of deltas between consecutive timestamps
  const timestamps = internalState.frameTimestamps;
  const bufferSize = FRAME_BUFFER_SIZE;
  const startIndex = (internalState.frameTimestampIndex - count + bufferSize) % bufferSize;
  
  let totalDelta = 0;
  for (let i = 1; i < count; i++) {
    const prevIndex = (startIndex + i - 1) % bufferSize;
    const currIndex = (startIndex + i) % bufferSize;
    const delta = timestamps[currIndex] - timestamps[prevIndex];
    totalDelta += delta;
  }

  const avgFrameTime = totalDelta / (count - 1);
  const fps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
  
  return fps as ExactFPS;
}

/**
 * Calculates frame time statistics from the circular buffer.
 * 
 * Computes min, max, avg, and percentiles (p50, p95, p99) for frame times.
 * Returns zero stats if insufficient data.
 * 
 * @param state - The scheduler state
 * @returns Frame time statistics
 */
export function getFrameStats(state: RenderSchedulerState): FrameTimeStats {
  const internalState = internalStateMap.get(state.id);
  if (!internalState) {
    return {
      min: 0 as Milliseconds,
      max: 0 as Milliseconds,
      avg: 0 as Milliseconds,
      p50: 0 as Milliseconds,
      p95: 0 as Milliseconds,
      p99: 0 as Milliseconds,
    };
  }

  const count = internalState.frameTimestampCount;
  if (count < 2) {
    return {
      min: 0 as Milliseconds,
      max: 0 as Milliseconds,
      avg: 0 as Milliseconds,
      p50: 0 as Milliseconds,
      p95: 0 as Milliseconds,
      p99: 0 as Milliseconds,
    };
  }

  // Extract deltas from circular buffer
  const timestamps = internalState.frameTimestamps;
  const bufferSize = FRAME_BUFFER_SIZE;
  const startIndex = (internalState.frameTimestampIndex - count + bufferSize) % bufferSize;
  
  const deltas = new Array<number>(count - 1);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  
  for (let i = 1; i < count; i++) {
    const prevIndex = (startIndex + i - 1) % bufferSize;
    const currIndex = (startIndex + i) % bufferSize;
    const delta = timestamps[currIndex] - timestamps[prevIndex];
    deltas[i - 1] = delta;
    
    if (delta < min) min = delta;
    if (delta > max) max = delta;
    sum += delta;
  }

  const avg = sum / deltas.length;

  // Sort for percentile calculations
  deltas.sort((a, b) => a - b);

  const p50Index = Math.floor(deltas.length * 0.50);
  const p95Index = Math.floor(deltas.length * 0.95);
  const p99Index = Math.floor(deltas.length * 0.99);

  return {
    min: min as Milliseconds,
    max: max as Milliseconds,
    avg: avg as Milliseconds,
    p50: deltas[p50Index] as Milliseconds,
    p95: deltas[p95Index] as Milliseconds,
    p99: deltas[p99Index] as Milliseconds,
  };
}

/**
 * Gets frame drop statistics for the scheduler.
 * 
 * @param state - The scheduler state
 * @returns Frame drop statistics
 */
export function getFrameDropStats(state: RenderSchedulerState): FrameDropStats {
  const internalState = internalStateMap.get(state.id);
  if (!internalState) {
    return {
      totalDrops: 0,
      consecutiveDrops: 0,
      lastDropTimestamp: 0 as Milliseconds,
    };
  }

  return {
    totalDrops: internalState.totalDroppedFrames,
    consecutiveDrops: internalState.consecutiveDroppedFrames,
    lastDropTimestamp: internalState.lastDropTimestamp as Milliseconds,
  };
}

/**
 * Gets total frames rendered and elapsed time.
 * 
 * @param state - The scheduler state
 * @returns Object with totalFrames and elapsedTime
 */
export function getTotalFrames(state: RenderSchedulerState): { totalFrames: number; elapsedTime: Milliseconds } {
  const internalState = internalStateMap.get(state.id);
  if (!internalState) {
    return { totalFrames: 0, elapsedTime: 0 as Milliseconds };
  }

  const elapsedTime = performance.now() - internalState.startTime;
  return {
    totalFrames: internalState.totalFrames,
    elapsedTime: elapsedTime as Milliseconds,
  };
}

/**
 * Destroys the render scheduler and cleans up resources.
 * Stops the loop if running and removes internal state from the map.
 * Returns a new state object with reset values.
 * After calling this, the scheduler must be recreated before use.
 * 
 * **Important:** Always call this function when done with a scheduler to prevent memory leaks.
 * The internal state map will retain entries until explicitly destroyed.
 * 
 * @param state - The scheduler state to destroy
 * @returns A new RenderSchedulerState with reset values
 */
export function destroyRenderScheduler(state: RenderSchedulerState): RenderSchedulerState {
  const internalState = internalStateMap.get(state.id);
  
  if (internalState) {
    // Stop the loop if running
    if (internalState.rafId !== null) {
      cancelAnimationFrame(internalState.rafId);
      internalState.rafId = null;
    }
    
    // Clear callback and frameHandler to prevent further execution
    internalState.callback = null;
    internalState.frameHandler = null;
    
    // Clean up internal state from map to prevent memory leak
    internalStateMap.delete(state.id);
  }

  // Return new state with reset values
  return createRenderScheduler();
}

/**
 * Convenience function that creates a scheduler and starts it in one step.
 * 
 * @param callback - Function to call each frame with delta time
 * @returns A RenderSchedulerState with the loop running
 * @throws {Error} If callback is not provided
 * 
 * @example
 * ```typescript
 * const scheduler = createRenderSchedulerAsync((deltaTime) => {
 *   renderFrame(deltaTime);
 * });
 * ```
 */
export function createRenderSchedulerAsync(callback: RenderCallback): RenderSchedulerState {
  const state = createRenderScheduler();
  return startRenderScheduler(state, callback);
}

/**
 * RenderScheduler class wrapper for backward compatibility.
 * 
 * This class provides a class-based API that internally uses the functional implementation.
 * Use the functional API directly for better type safety and immutability.
 */
export class RenderScheduler {
  private _state: RenderSchedulerState;

  /**
   * Checks if the scheduler is currently running.
   */
  get running(): boolean {
    return this._state.running;
  }

  /**
   * Creates a new RenderScheduler instance.
   */
  constructor() {
    this._state = createRenderScheduler();
  }

  /**
   * Starts the render loop.
   * 
   * @param callback - Function to call each frame with delta time
   * @throws {Error} If callback is not provided or scheduler already running
   */
  start(callback: RenderCallback): void {
    this._state = startRenderScheduler(this._state, callback);
  }

  /**
   * Stops the render loop.
   */
  stop(): void {
    this._state = stopRenderScheduler(this._state);
  }

  /**
   * Marks the current frame as dirty, indicating it needs to be rendered.
   */
  requestRender(): void {
    requestRender(this._state);
  }

  /**
   * Destroys the render scheduler and cleans up resources.
   * After calling destroy(), the scheduler must be recreated before use.
   */
  destroy(): void {
    this._state = destroyRenderScheduler(this._state);
  }
}
