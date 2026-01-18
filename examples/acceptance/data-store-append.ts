/// <reference types="@webgpu/types" />

// TypeScript-only acceptance checks for createDataStore append behavior.
// This file is excluded from the library build (tsconfig excludes `examples/`).
//
// Intent: validate that appendSeries correctly handles fast path (no reallocation)
// and slow path (reallocation), maintains pointCount/hash32/getSeriesData correctness.

import { createDataStore } from '../../src/data/createDataStore';
import type { DataPoint } from '../../src/config/types';

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

/**
 * Minimal fake GPUDevice for Node.js acceptance tests.
 * Implements only the subset of GPUDevice needed for createDataStore.
 */
function createFakeDevice(): GPUDevice {
  const buffers = new Map<GPUBuffer, { size: number; data: ArrayBuffer }>();

  // Expose WebGPU constants needed by createDataStore
  const GPUBufferUsage = {
    VERTEX: 0x20,
    COPY_DST: 0x08,
  };

  const device: GPUDevice = {
    limits: {
      maxBufferSize: 1024 * 1024 * 1024, // 1GB
    },
    createBuffer: (descriptor: GPUBufferDescriptor): GPUBuffer => {
      const size = descriptor.size ?? 0;
      const data = new ArrayBuffer(size);
      const buffer = {
        destroy: () => {
          buffers.delete(buffer as GPUBuffer);
        },
      } as GPUBuffer;
      buffers.set(buffer as GPUBuffer, { size, data });
      return buffer;
    },
    queue: {
      writeBuffer: (buffer: GPUBuffer, bufferOffset: number, data: ArrayBuffer | ArrayBufferView, dataOffset?: number, size?: number): void => {
        const entry = buffers.get(buffer);
        if (!entry) throw new Error('Buffer not found');
        
        const source = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const target = new Uint8Array(entry.data);
        const actualSize = size ?? source.length;
        const actualDataOffset = dataOffset ?? 0;
        
        if (bufferOffset + actualSize > entry.size) {
          throw new Error(`writeBuffer: offset ${bufferOffset} + size ${actualSize} exceeds buffer size ${entry.size}`);
        }
        
        for (let i = 0; i < actualSize; i++) {
          target[bufferOffset + i] = source[actualDataOffset + i]!;
        }
      },
    },
  } as GPUDevice;

  // Inject GPUBufferUsage into global scope for createDataStore to access
  (globalThis as unknown as { GPUBufferUsage: typeof GPUBufferUsage }).GPUBufferUsage = GPUBufferUsage;

  return device;
}

// Fast path: append without reallocation
{
  const device = createFakeDevice();
  const store = createDataStore(device);
  
  const initialData: DataPoint[] = [
    [0, 1],
    [1, 2],
    [2, 3],
  ];
  
  store.setSeries(0, initialData);
  assert(store.getSeriesPointCount(0) === 3, 'Expected initial pointCount=3');
  
  const initialDataRef = store.getSeriesData(0);
  assert(initialDataRef.length === 3, 'Expected initial data length=3');
  
  const appendData: DataPoint[] = [
    [3, 4],
    [4, 5],
  ];
  
  store.appendSeries(0, appendData);
  assert(store.getSeriesPointCount(0) === 5, 'Expected pointCount=5 after append');
  
  const finalData = store.getSeriesData(0);
  assert(finalData.length === 5, 'Expected final data length=5');
  assert(finalData[0]![0] === 0 && finalData[0]![1] === 1, 'Expected first point preserved');
  assert(finalData[4]![0] === 4 && finalData[4]![1] === 5, 'Expected appended point present');
}

// Slow path: append triggers reallocation
{
  const device = createFakeDevice();
  const store = createDataStore(device);
  
  // Set initial data that fills buffer exactly (or nearly)
  const initialData: DataPoint[] = Array.from({ length: 10 }, (_, i) => [i, i * 2] as DataPoint);
  store.setSeries(0, initialData);
  
  const initialCount = store.getSeriesPointCount(0);
  assert(initialCount === 10, `Expected initial pointCount=10, got ${initialCount}`);
  
  // Append enough data to trigger reallocation
  const largeAppend: DataPoint[] = Array.from({ length: 100 }, (_, i) => [i + 10, (i + 10) * 2] as DataPoint);
  store.appendSeries(0, largeAppend);
  
  const finalCount = store.getSeriesPointCount(0);
  assert(finalCount === 110, `Expected final pointCount=110, got ${finalCount}`);
  
  const finalData = store.getSeriesData(0);
  assert(finalData.length === 110, `Expected final data length=110, got ${finalData.length}`);
  assert(finalData[0]![0] === 0, 'Expected first point preserved after reallocation');
  assert(finalData[109]![0] === 109, 'Expected last appended point present');
}

// Multiple appends: coalesce into single buffer update (fast path)
{
  const device = createFakeDevice();
  const store = createDataStore(device);
  
  store.setSeries(0, [[0, 0]]);
  
  // Multiple small appends should all succeed
  store.appendSeries(0, [[1, 1]]);
  store.appendSeries(0, [[2, 2]]);
  store.appendSeries(0, [[3, 3]]);
  
  assert(store.getSeriesPointCount(0) === 4, 'Expected pointCount=4 after multiple appends');
  const data = store.getSeriesData(0);
  assert(data.length === 4, 'Expected data length=4');
  assert(data[3]![0] === 3 && data[3]![1] === 3, 'Expected last appended point correct');
}

// Error case: append before setSeries should throw
{
  const device = createFakeDevice();
  const store = createDataStore(device);
  
  let threw = false;
  try {
    store.appendSeries(0, [[1, 1]]);
  } catch (e) {
    threw = true;
    assert(
      e instanceof Error && e.message.includes('has no data'),
      `Expected error about missing series, got: ${e}`
    );
  }
  assert(threw, 'Expected appendSeries to throw when series not set');
}

// Hash consistency: hash should update incrementally on fast path
{
  const device = createFakeDevice();
  const store = createDataStore(device);
  
  const data1: DataPoint[] = [[0, 1], [1, 2]];
  store.setSeries(0, data1);
  const initialCount = store.getSeriesPointCount(0);
  
  const append1: DataPoint[] = [[2, 3]];
  store.appendSeries(0, append1);
  
  // Fast path should preserve pointCount incrementally
  assert(store.getSeriesPointCount(0) === initialCount + 1, 'Expected pointCount incremented');
  
  const finalData = store.getSeriesData(0);
  assert(finalData.length === 3, 'Expected final data length=3');
  assert(finalData[2]![0] === 2 && finalData[2]![1] === 3, 'Expected appended point correct');
}

// Empty append should be no-op
{
  const device = createFakeDevice();
  const store = createDataStore(device);
  
  store.setSeries(0, [[0, 0], [1, 1]]);
  const initialCount = store.getSeriesPointCount(0);
  
  store.appendSeries(0, []);
  
  assert(store.getSeriesPointCount(0) === initialCount, 'Expected pointCount unchanged after empty append');
}

// Dispose cleanup
{
  const device = createFakeDevice();
  const store = createDataStore(device);
  
  store.setSeries(0, [[0, 0]]);
  store.dispose();
  
  let threw = false;
  try {
    store.getSeriesPointCount(0);
  } catch (e) {
    threw = true;
    assert(
      e instanceof Error && e.message.includes('disposed'),
      `Expected error about disposed store, got: ${e}`
    );
  }
  assert(threw, 'Expected operations to throw after dispose');
}

console.log('[acceptance:data-store-append] OK');
