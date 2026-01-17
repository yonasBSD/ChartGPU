/**
 * GPUContext - WebGPU device and adapter management
 * 
 * Handles WebGPU initialization, adapter selection, and device creation
 * following WebGPU best practices for resource management and error handling.
 * 
 * This module provides both functional and class-based APIs for maximum flexibility.
 */

/**
 * Represents the state of a GPU context.
 * All properties are readonly to ensure immutability.
 */
export interface GPUContextState {
  readonly adapter: GPUAdapter | null;
  readonly device: GPUDevice | null;
  readonly initialized: boolean;
  readonly canvas: HTMLCanvasElement | null;
  readonly canvasContext: GPUCanvasContext | null;
  readonly preferredFormat: GPUTextureFormat | null;
}

/**
 * Creates a new GPUContext state with initial values.
 * 
 * @param canvas - Optional HTMLCanvasElement to configure for WebGPU rendering
 * @returns A new GPUContextState instance
 */
export function createGPUContext(canvas?: HTMLCanvasElement): GPUContextState {
  return {
    adapter: null,
    device: null,
    initialized: false,
    canvas: canvas || null,
    canvasContext: null,
    preferredFormat: null,
  };
}

/**
 * Initializes the WebGPU context by requesting an adapter and device.
 * Returns a new state object with initialized values.
 * 
 * @param context - The GPU context state to initialize
 * @returns A new GPUContextState with initialized adapter and device
 * @throws {Error} If WebGPU is not available in the browser
 * @throws {Error} If adapter request fails
 * @throws {Error} If device request fails
 * @throws {Error} If already initialized
 */
export async function initializeGPUContext(
  context: GPUContextState
): Promise<GPUContextState> {
  if (context.initialized) {
    throw new Error('GPUContext is already initialized. Call destroyGPUContext() before reinitializing.');
  }

  // Check for WebGPU support
  if (!navigator.gpu) {
    throw new Error(
      'WebGPU is not available in this browser. ' +
      'Please use a browser that supports WebGPU (Chrome 113+, Edge 113+, or Safari 18+). ' +
      'Ensure WebGPU is enabled in browser flags if needed.'
    );
  }

  try {
    // Request adapter with high-performance preference
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });

    if (!adapter) {
      throw new Error(
        'Failed to request WebGPU adapter. ' +
        'No compatible adapter found. This may occur if no GPU is available or WebGPU is disabled.'
      );
    }

    // Request device from adapter
    const device = await adapter.requestDevice();

    if (!device) {
      throw new Error('Failed to request WebGPU device from adapter.');
    }

    // Set up device lost handler for error recovery
    device.addEventListener('uncapturederror', (event: GPUUncapturedErrorEvent) => {
      console.error('WebGPU uncaptured error:', event.error);
    });

    let canvasContext: GPUCanvasContext | null = null;
    let preferredFormat: GPUTextureFormat | null = null;

    // Configure canvas if provided
    if (context.canvas) {
      const webgpuContext = context.canvas.getContext('webgpu') as GPUCanvasContext | null;
      
      if (!webgpuContext) {
        // Clean up device before throwing
        try {
          device.destroy();
        } catch (error) {
          console.warn('Error destroying device during canvas setup failure:', error);
        }
        throw new Error('Failed to get WebGPU context from canvas.');
      }

      // Handle device pixel ratio for high-DPI displays
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = context.canvas.clientWidth || context.canvas.width;
      const displayHeight = context.canvas.clientHeight || context.canvas.height;
      
      // Set canvas internal size based on device pixel ratio
      context.canvas.width = Math.max(1, Math.floor(displayWidth * dpr));
      context.canvas.height = Math.max(1, Math.floor(displayHeight * dpr));

      // Get preferred format from adapter, fallback to bgra8unorm
      // Note: getPreferredCanvasFormat may not be in type definitions yet
      const adapterWithFormat = adapter as GPUAdapter & { getPreferredCanvasFormat?: () => GPUTextureFormat };
      preferredFormat = adapterWithFormat.getPreferredCanvasFormat?.() || 'bgra8unorm';

      // Configure the canvas context
      webgpuContext.configure({
        device: device,
        format: preferredFormat,
      });

      canvasContext = webgpuContext;
    }

    return {
      adapter,
      device,
      initialized: true,
      canvas: context.canvas,
      canvasContext,
      preferredFormat,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to initialize GPUContext: ${String(error)}`);
  }
}

/**
 * Gets the current texture from the canvas context.
 * 
 * @param context - The GPU context state
 * @returns The current canvas texture
 * @throws {Error} If canvas is not configured or context is not initialized
 * 
 * @example
 * ```typescript
 * const texture = getCanvasTexture(context);
 * // Use texture in render pass
 * ```
 */
export function getCanvasTexture(context: GPUContextState): GPUTexture {
  if (!context.canvas) {
    throw new Error('Canvas is not configured. Provide a canvas element when creating the context.');
  }

  if (!context.initialized || !context.canvasContext) {
    throw new Error('GPUContext is not initialized. Call initializeGPUContext() first.');
  }

  return context.canvasContext.getCurrentTexture();
}

/**
 * Destroys the WebGPU device and cleans up resources.
 * Returns a new state object with reset values.
 * After calling this, the context must be reinitialized before use.
 * 
 * @param context - The GPU context state to destroy
 * @returns A new GPUContextState with reset values
 */
export function destroyGPUContext(context: GPUContextState): GPUContextState {
  if (context.device) {
    try {
      context.device.destroy();
    } catch (error) {
      console.warn('Error destroying GPU device:', error);
    }
  }

  return {
    adapter: null,
    device: null,
    initialized: false,
    canvas: context.canvas,
    canvasContext: null,
    preferredFormat: null,
  };
}

/**
 * Convenience function that creates and initializes a GPU context in one step.
 * 
 * @param canvas - Optional HTMLCanvasElement to configure for WebGPU rendering
 * @returns A fully initialized GPUContextState
 * @throws {Error} If initialization fails
 * 
 * @example
 * ```typescript
 * const context = await createGPUContextAsync();
 * const device = context.device;
 * ```
 * 
 * @example
 * ```typescript
 * const canvas = document.querySelector('canvas');
 * const context = await createGPUContextAsync(canvas);
 * const texture = getCanvasTexture(context);
 * ```
 */
export async function createGPUContextAsync(
  canvas?: HTMLCanvasElement
): Promise<GPUContextState> {
  const context = createGPUContext(canvas);
  return initializeGPUContext(context);
}

/**
 * GPUContext class wrapper for backward compatibility.
 * 
 * This class provides a class-based API that internally uses the functional implementation.
 * Use the functional API directly for better type safety and immutability.
 */
export class GPUContext {
  private _state: GPUContextState;

  /**
   * Gets the WebGPU adapter, or null if not initialized.
   */
  get adapter(): GPUAdapter | null {
    return this._state.adapter;
  }

  /**
   * Gets the WebGPU device, or null if not initialized.
   */
  get device(): GPUDevice | null {
    return this._state.device;
  }

  /**
   * Checks if the context has been initialized.
   */
  get initialized(): boolean {
    return this._state.initialized;
  }

  /**
   * Gets the canvas element, or null if not provided.
   */
  get canvas(): HTMLCanvasElement | null {
    return this._state.canvas;
  }

  /**
   * Gets the WebGPU canvas context, or null if canvas is not configured.
   */
  get canvasContext(): GPUCanvasContext | null {
    return this._state.canvasContext;
  }

  /**
   * Gets the preferred canvas format, or null if canvas is not configured.
   */
  get preferredFormat(): GPUTextureFormat | null {
    return this._state.preferredFormat;
  }

  /**
   * Creates a new GPUContext instance.
   * 
   * @param canvas - Optional HTMLCanvasElement to configure for WebGPU rendering
   */
  constructor(canvas?: HTMLCanvasElement) {
    this._state = createGPUContext(canvas);
  }

  /**
   * Initializes the WebGPU context by requesting an adapter and device.
   * 
   * @throws {Error} If WebGPU is not available in the browser
   * @throws {Error} If adapter request fails
   * @throws {Error} If device request fails
   * @throws {Error} If already initialized
   */
  async initialize(): Promise<void> {
    this._state = await initializeGPUContext(this._state);
  }

  /**
   * Static factory method to create and initialize a GPUContext instance.
   * 
   * @param canvas - Optional HTMLCanvasElement to configure for WebGPU rendering
   * @returns A fully initialized GPUContext instance
   * @throws {Error} If initialization fails
   * 
   * @example
   * ```typescript
   * const context = await GPUContext.create();
   * const device = context.device;
   * ```
   * 
   * @example
   * ```typescript
   * const canvas = document.querySelector('canvas');
   * const context = await GPUContext.create(canvas);
   * const texture = context.getCanvasTexture();
   * ```
   */
  static async create(canvas?: HTMLCanvasElement): Promise<GPUContext> {
    const context = new GPUContext(canvas);
    await context.initialize();
    return context;
  }

  /**
   * Gets the current texture from the canvas context.
   * 
   * @returns The current canvas texture
   * @throws {Error} If canvas is not configured or context is not initialized
   * 
   * @example
   * ```typescript
   * const texture = context.getCanvasTexture();
   * // Use texture in render pass
   * ```
   */
  getCanvasTexture(): GPUTexture {
    return getCanvasTexture(this._state);
  }

  /**
   * Destroys the WebGPU device and cleans up resources.
   * After calling destroy(), the context must be reinitialized before use.
   */
  destroy(): void {
    this._state = destroyGPUContext(this._state);
  }
}
