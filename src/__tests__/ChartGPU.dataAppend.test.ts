/// <reference types="@webgpu/types" />

/**
 * Tests for ChartGPU `dataAppend` event (CGPU-DATA-EVENT).
 * Verifies event fires from appendData() with correct payload for all supported formats,
 * setOption() does NOT emit, off() removes listener, and multiple listeners work correctly.
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterEach } from 'vitest';
import { ChartGPU } from '../ChartGPU';
import type { ChartGPUInstance, ChartGPUDataAppendPayload } from '../ChartGPU';
import type { ChartGPUOptions } from '../config/types';

// Mock WebGPU globals before importing the module
beforeAll(() => {
  // Mock window global for SSR-safe checks
  if (typeof window === 'undefined') {
    // @ts-ignore - Mock window global
    globalThis.window = globalThis;
  }

  // Mock document if not available
  if (typeof document === 'undefined') {
    // @ts-ignore - Mock document global
    globalThis.document = {
      createElement: (tagName: string) => {
        if (tagName === 'canvas') {
          return createMockCanvas();
        }
        return {
          style: {},
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        };
      },
    };
  }

  // @ts-ignore - Mock WebGPU globals
  globalThis.GPUShaderStage = {
    VERTEX: 1,
    FRAGMENT: 2,
    COMPUTE: 4,
  };
  // @ts-ignore - Mock WebGPU texture usage flags
  globalThis.GPUTextureUsage = {
    COPY_SRC: 0x01,
    COPY_DST: 0x02,
    TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08,
    RENDER_ATTACHMENT: 0x10,
  };
  // @ts-ignore - Mock WebGPU buffer usage flags
  globalThis.GPUBufferUsage = {
    MAP_READ: 0x0001,
    MAP_WRITE: 0x0002,
    COPY_SRC: 0x0004,
    COPY_DST: 0x0008,
    INDEX: 0x0010,
    VERTEX: 0x0020,
    UNIFORM: 0x0040,
    STORAGE: 0x0080,
    INDIRECT: 0x0100,
    QUERY_RESOLVE: 0x0200,
  };
});

// Mock canvas element
function createMockCanvas(): HTMLCanvasElement {
  const canvas = {
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    style: {},
    getBoundingClientRect: vi.fn(() => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })),
    getContext: vi.fn((contextId: string) => {
      if (contextId === 'webgpu') {
        return {
          configure: vi.fn(),
          unconfigure: vi.fn(),
          getCurrentTexture: vi.fn(() => ({
            createView: vi.fn(() => ({})),
          })),
        };
      }
      return null;
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    remove: vi.fn(),
  } as any;
  return canvas;
}

// Mock GPUDevice
function createMockDevice(): GPUDevice {
  const mockDevice = {
    limits: {
      maxTextureDimension2D: 8192,
      maxBufferSize: 268435456,
      maxStorageBufferBindingSize: 268435456,
      maxBindGroups: 4,
    },
    destroy: vi.fn(),
    createBuffer: vi.fn(() => ({
      destroy: vi.fn(),
      unmap: vi.fn(),
      getMappedRange: vi.fn(() => new ArrayBuffer(0)),
    })),
    createTexture: vi.fn(() => ({
      destroy: vi.fn(),
      createView: vi.fn(() => ({})),
    })),
    createBindGroup: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({})),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn(() => ({
        end: vi.fn(),
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        setVertexBuffer: vi.fn(),
        setIndexBuffer: vi.fn(),
        setScissorRect: vi.fn(),
        setViewport: vi.fn(),
        setBlendConstant: vi.fn(),
        setStencilReference: vi.fn(),
        draw: vi.fn(),
        drawIndexed: vi.fn(),
        drawIndirect: vi.fn(),
        drawIndexedIndirect: vi.fn(),
      })),
      beginComputePass: vi.fn(() => ({
        end: vi.fn(),
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        dispatchWorkgroups: vi.fn(),
        dispatchWorkgroupsIndirect: vi.fn(),
      })),
      finish: vi.fn(() => ({})),
      copyBufferToBuffer: vi.fn(),
      copyTextureToTexture: vi.fn(),
      copyBufferToTexture: vi.fn(),
      copyTextureToBuffer: vi.fn(),
      clearBuffer: vi.fn(),
      writeTimestamp: vi.fn(),
      resolveQuerySet: vi.fn(),
    })),
    queue: {
      submit: vi.fn(),
      writeBuffer: vi.fn(),
    },
    addEventListener: vi.fn(),
    // Use a never-resolving promise to avoid auto-triggering device lost handlers
    lost: new Promise(() => {}),
  } as any;
  return mockDevice;
}

// Mock GPUAdapter
function createMockAdapter(): GPUAdapter {
  const mockAdapter = {
    requestDevice: vi.fn(async () => createMockDevice()),
    features: new Set<string>(),
    limits: {
      maxTextureDimension2D: 8192,
      maxBufferSize: 268435456,
      maxStorageBufferBindingSize: 268435456,
    },
  } as any;
  return mockAdapter;
}

// Mock navigator.gpu
function setupMockNavigatorGPU(adapter: GPUAdapter | null = createMockAdapter()): void {
  vi.stubGlobal('navigator', {
    gpu: {
      requestAdapter: vi.fn(async () => adapter),
      getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm'),
    },
  });
}

// Mock container element
function createMockContainer(): HTMLElement {
  const container = {
    style: {},
    clientWidth: 800,
    clientHeight: 600,
    appendChild: vi.fn(),
    removeChild: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })),
  } as any;
  return container;
}

describe('ChartGPU - dataAppend event', () => {
  let mockContainer: HTMLElement;
  let warnSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    mockContainer = createMockContainer();
    setupMockNavigatorGPU();
    // Silence expected ChartGPU warnings in tests (e.g. streaming sampling hints, pie append warning).
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Mock requestAnimationFrame
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      setTimeout(() => cb(performance.now()), 0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    // Mock devicePixelRatio
    vi.stubGlobal('devicePixelRatio', 2);
  });

  afterEach(() => {
    warnSpy?.mockRestore();
    warnSpy = null;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Event emission with different data formats', () => {
    it('emits dataAppend with InterleavedXYData: xExtent min/max correct, count correct', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            sampling: 'none',
            data: [{ x: 1, y: 10 }, { x: 2, y: 20 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append with Float32Array interleaved [x0, y0, x1, y1, x2, y2]
      const interleaved = new Float32Array([3, 30, 4, 40, 5, 50]);
      chart.appendData(0, interleaved);

      // Wait for any async emission (requestAnimationFrame)
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: ChartGPUDataAppendPayload = listener.mock.calls[0][0];
      
      expect(payload.seriesIndex).toBe(0);
      expect(payload.count).toBe(3); // 6 values / 2 = 3 points
      expect(payload.xExtent.min).toBe(3);
      expect(payload.xExtent.max).toBe(5);

      await chart.dispose();
    });

    it('emits dataAppend with XYArraysData: xExtent correct, count correct', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            sampling: 'none',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append with separate arrays
      const xyArrays = {
        x: new Float64Array([2, 3, 4, 5]),
        y: new Float32Array([20, 30, 40, 50]),
        size: new Float32Array([8, 10, 12, 14]),
      };
      chart.appendData(0, xyArrays);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: ChartGPUDataAppendPayload = listener.mock.calls[0][0];
      
      expect(payload.seriesIndex).toBe(0);
      expect(payload.count).toBe(4);
      expect(payload.xExtent.min).toBe(2);
      expect(payload.xExtent.max).toBe(5);

      await chart.dispose();
    });

    it('emits dataAppend with DataPoint[] tuple: xExtent correct', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'scatter',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append with DataPoint tuples
      const tuples: Array<[number, number, number?]> = [
        [2, 20, 5],
        [3, 30, 6],
        [4, 40, 7],
      ];
      chart.appendData(0, tuples);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: ChartGPUDataAppendPayload = listener.mock.calls[0][0];
      
      expect(payload.seriesIndex).toBe(0);
      expect(payload.count).toBe(3);
      expect(payload.xExtent.min).toBe(2);
      expect(payload.xExtent.max).toBe(4);

      await chart.dispose();
    });

    it('emits dataAppend with DataPoint[] object: xExtent correct', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'area',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append with DataPoint objects
      const objects = [
        { x: 2, y: 20 },
        { x: 3, y: 30 },
        { x: 4, y: 40 },
        { x: 5, y: 50 },
      ];
      chart.appendData(0, objects);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: ChartGPUDataAppendPayload = listener.mock.calls[0][0];
      
      expect(payload.seriesIndex).toBe(0);
      expect(payload.count).toBe(4);
      expect(payload.xExtent.min).toBe(2);
      expect(payload.xExtent.max).toBe(5);

      await chart.dispose();
    });

    it('handles empty append gracefully (no event emission)', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append empty array
      chart.appendData(0, []);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not emit for empty append
      expect(listener).not.toHaveBeenCalled();

      await chart.dispose();
    });

    it('handles xExtent when appending single point', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append single point
      chart.appendData(0, [{ x: 42, y: 100 }]);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: ChartGPUDataAppendPayload = listener.mock.calls[0][0];
      
      expect(payload.count).toBe(1);
      expect(payload.xExtent.min).toBe(42);
      expect(payload.xExtent.max).toBe(42);

      await chart.dispose();
    });

    it('handles negative and mixed x values correctly in xExtent', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 0, y: 0 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append with negative and positive values
      const data = new Float32Array([-5, 10, -2, 20, 3, 30, -10, 40]);
      chart.appendData(0, data);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: ChartGPUDataAppendPayload = listener.mock.calls[0][0];
      
      expect(payload.count).toBe(4);
      expect(payload.xExtent.min).toBe(-10);
      expect(payload.xExtent.max).toBe(3);

      await chart.dispose();
    });
  });

  describe('setOption() does NOT emit dataAppend', () => {
    it('does not emit dataAppend when calling setOption with new data', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Call setOption with different data
      chart.setOption({
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 30 }],
          },
        ],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should NOT emit dataAppend
      expect(listener).not.toHaveBeenCalled();

      await chart.dispose();
    });

    it('does not emit dataAppend when setOption changes series type', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Change series type via setOption
      chart.setOption({
        series: [
          {
            type: 'area',
            data: [{ x: 1, y: 10 }, { x: 2, y: 20 }],
          },
        ],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).not.toHaveBeenCalled();

      await chart.dispose();
    });
  });

  describe('off() removes listener', () => {
    it('removes listener and stops receiving events', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append data - should trigger
      chart.appendData(0, [{ x: 2, y: 20 }]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);

      // Remove listener
      chart.off('dataAppend', listener);

      // Append more data - should NOT trigger
      chart.appendData(0, [{ x: 3, y: 30 }]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Still only 1 call (from before off())
      expect(listener).toHaveBeenCalledTimes(1);

      await chart.dispose();
    });

    it('off() with wrong callback reference does not affect listener', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      const differentListener = vi.fn();
      
      chart.on('dataAppend', listener);

      // Try to remove a different callback
      chart.off('dataAppend', differentListener);

      // Append data - should still trigger original listener
      chart.appendData(0, [{ x: 2, y: 20 }]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      expect(differentListener).not.toHaveBeenCalled();

      await chart.dispose();
    });
  });

  describe('Multiple listeners all fire', () => {
    it('calls all registered listeners once with same payload', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      chart.on('dataAppend', listener1);
      chart.on('dataAppend', listener2);
      chart.on('dataAppend', listener3);

      // Append data
      chart.appendData(0, [{ x: 2, y: 20 }, { x: 3, y: 30 }]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // All listeners should be called once
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);

      // All should receive the same payload
      const payload1: ChartGPUDataAppendPayload = listener1.mock.calls[0][0];
      const payload2: ChartGPUDataAppendPayload = listener2.mock.calls[0][0];
      const payload3: ChartGPUDataAppendPayload = listener3.mock.calls[0][0];

      expect(payload1.seriesIndex).toBe(0);
      expect(payload1.count).toBe(2);
      expect(payload1.xExtent.min).toBe(2);
      expect(payload1.xExtent.max).toBe(3);

      // Verify same values in all payloads
      expect(payload2).toEqual(payload1);
      expect(payload3).toEqual(payload1);

      await chart.dispose();
    });

    it('removing one listener does not affect others', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      chart.on('dataAppend', listener1);
      chart.on('dataAppend', listener2);
      chart.on('dataAppend', listener3);

      // Remove middle listener
      chart.off('dataAppend', listener2);

      // Append data
      chart.appendData(0, [{ x: 2, y: 20 }]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Only listeners 1 and 3 should be called
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).not.toHaveBeenCalled();
      expect(listener3).toHaveBeenCalledTimes(1);

      await chart.dispose();
    });
  });

  describe('Candlestick series support', () => {
    it('emits dataAppend for candlestick series with correct xExtent from timestamp', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'candlestick',
            data: [
              { timestamp: 1000, open: 100, high: 110, low: 95, close: 105 },
            ],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append candlestick data
      chart.appendData(0, [
        { timestamp: 2000, open: 105, high: 115, low: 100, close: 110 },
        { timestamp: 3000, open: 110, high: 120, low: 108, close: 115 },
        { timestamp: 4000, open: 115, high: 125, low: 110, close: 120 },
      ]);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: ChartGPUDataAppendPayload = listener.mock.calls[0][0];
      
      expect(payload.seriesIndex).toBe(0);
      expect(payload.count).toBe(3);
      expect(payload.xExtent.min).toBe(2000);
      expect(payload.xExtent.max).toBe(4000);

      await chart.dispose();
    });

    it('emits dataAppend for candlestick with tuple format', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'candlestick',
            data: [
              [1000, 100, 105, 95, 110], // [timestamp, open, close, low, high]
            ],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append with tuple format
      chart.appendData(0, [
        [2000, 105, 110, 100, 115] as [number, number, number, number, number],
        [3000, 110, 115, 108, 120] as [number, number, number, number, number],
      ]);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: ChartGPUDataAppendPayload = listener.mock.calls[0][0];
      
      expect(payload.seriesIndex).toBe(0);
      expect(payload.count).toBe(2);
      expect(payload.xExtent.min).toBe(2000);
      expect(payload.xExtent.max).toBe(3000);

      await chart.dispose();
    });
  });

  describe('NaN and Infinity handling', () => {
    it('skips NaN x-values and computes xExtent from valid values only (XYArrays)', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append with some NaN x-values
      const xyArrays = {
        x: new Float32Array([NaN, 2, 3, NaN, 5]),
        y: new Float32Array([10, 20, 30, 40, 50]),
      };
      chart.appendData(0, xyArrays);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: ChartGPUDataAppendPayload = listener.mock.calls[0][0];
      
      expect(payload.count).toBe(5);
      // Should compute extent from valid values only: 2, 3, 5
      expect(payload.xExtent.min).toBe(2);
      expect(payload.xExtent.max).toBe(5);

      await chart.dispose();
    });

    it('skips Infinity x-values and computes xExtent from finite values (Interleaved)', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append with Infinity values
      const interleaved = new Float32Array([
        2, 20,           // valid
        Infinity, 30,    // invalid x
        4, 40,           // valid
        -Infinity, 50,   // invalid x
        6, 60,           // valid
      ]);
      chart.appendData(0, interleaved);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: ChartGPUDataAppendPayload = listener.mock.calls[0][0];
      
      expect(payload.count).toBe(5);
      // Should compute extent from finite values only: 2, 4, 6
      expect(payload.xExtent.min).toBe(2);
      expect(payload.xExtent.max).toBe(6);

      await chart.dispose();
    });

    it('returns zero extent when all x-values are NaN (DataPoint array)', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'scatter',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append with all NaN x-values
      chart.appendData(0, [
        { x: NaN, y: 10 },
        { x: NaN, y: 20 },
        { x: NaN, y: 30 },
      ]);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: ChartGPUDataAppendPayload = listener.mock.calls[0][0];
      
      expect(payload.count).toBe(3);
      // When no finite x-values, should return zero extent
      expect(payload.xExtent.min).toBe(0);
      expect(payload.xExtent.max).toBe(0);

      await chart.dispose();
    });

    it('returns zero extent when all x-values are Infinity (candlestick)', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'candlestick',
            data: [
              { timestamp: 1000, open: 100, high: 110, low: 95, close: 105 },
            ],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append with all Infinity timestamps
      chart.appendData(0, [
        { timestamp: Infinity, open: 105, high: 115, low: 100, close: 110 },
        { timestamp: -Infinity, open: 110, high: 120, low: 108, close: 115 },
      ]);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: ChartGPUDataAppendPayload = listener.mock.calls[0][0];
      
      expect(payload.count).toBe(2);
      expect(payload.xExtent.min).toBe(0);
      expect(payload.xExtent.max).toBe(0);

      await chart.dispose();
    });

    it('handles mixed NaN, Infinity, and valid values correctly', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Mix of valid, NaN, and Infinity values
      chart.appendData(0, [
        { x: 10, y: 100 },      // valid
        { x: NaN, y: 200 },     // invalid
        { x: 20, y: 300 },      // valid
        { x: Infinity, y: 400 },// invalid
        { x: 5, y: 500 },       // valid
        { x: -Infinity, y: 600 },// invalid
        { x: 15, y: 700 },      // valid
      ]);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: ChartGPUDataAppendPayload = listener.mock.calls[0][0];
      
      expect(payload.count).toBe(7);
      // Valid values: 10, 20, 5, 15 -> min=5, max=20
      expect(payload.xExtent.min).toBe(5);
      expect(payload.xExtent.max).toBe(20);

      await chart.dispose();
    });
  });

  describe('Zero-listener performance optimization', () => {
    it('does not compute xExtent when no listeners are registered', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            sampling: 'none',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      // No listener registered - the xExtent computation should be skipped
      // We can't directly verify it was skipped, but we can verify no errors occur
      // and the append succeeds
      
      const largeData = new Float32Array(20000); // 10k points
      for (let i = 0; i < 10000; i++) {
        largeData[i * 2] = i;
        largeData[i * 2 + 1] = Math.sin(i / 100) * 100;
      }

      // This should complete without computing xExtent
      chart.appendData(0, largeData);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // No errors should occur
      expect(chart.disposed).toBe(false);

      await chart.dispose();
    });

    it('computes xExtent only when at least one listener is registered', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      // First append without listener - no event
      chart.appendData(0, [{ x: 2, y: 20 }]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Now register listener
      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Second append with listener - should emit
      chart.appendData(0, [{ x: 3, y: 30 }]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: ChartGPUDataAppendPayload = listener.mock.calls[0][0];
      expect(payload.xExtent.min).toBe(3);
      expect(payload.xExtent.max).toBe(3);

      // Remove listener
      chart.off('dataAppend', listener);

      // Third append without listener - no event
      listener.mockClear();
      chart.appendData(0, [{ x: 4, y: 40 }]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).not.toHaveBeenCalled();

      await chart.dispose();
    });
  });

  describe('Edge cases and error scenarios', () => {
    it('does not emit for invalid series index', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Try to append to non-existent series
      chart.appendData(999, [{ x: 2, y: 20 }]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).not.toHaveBeenCalled();

      await chart.dispose();
    });

    it('does not emit for pie series (not supported)', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'pie',
            data: [
              { name: 'A', value: 10 },
              { name: 'B', value: 20 },
            ],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Try to append to pie series (should log warning but not crash)
      chart.appendData(0, [{ x: 3, y: 30 }] as any);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).not.toHaveBeenCalled();

      await chart.dispose();
    });

    it('does not emit after chart is disposed', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      await chart.dispose();

      // Try to append after disposal
      chart.appendData(0, [{ x: 2, y: 20 }]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).not.toHaveBeenCalled();
    });

    it('handles multiple series correctly', async () => {
      const options: ChartGPUOptions = {
        series: [
          {
            type: 'line',
            data: [{ x: 1, y: 10 }],
          },
          {
            type: 'scatter',
            data: [{ x: 1, y: 5 }],
          },
        ],
      };

      const chart = await ChartGPU.create(mockContainer, options);

      const listener = vi.fn();
      chart.on('dataAppend', listener);

      // Append to first series
      chart.appendData(0, [{ x: 2, y: 20 }]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].seriesIndex).toBe(0);

      listener.mockClear();

      // Append to second series
      chart.appendData(1, [{ x: 2, y: 10 }]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].seriesIndex).toBe(1);

      await chart.dispose();
    });
  });
});
