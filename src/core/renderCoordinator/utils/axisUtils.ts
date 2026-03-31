/**
 * Axis and grid utilities for the RenderCoordinator.
 *
 * These pure functions handle coordinate transformations between different spaces:
 * - CSS pixels (DOM layout)
 * - Device pixels (canvas.width/height)
 * - Normalized device coordinates / clip space (WebGPU [-1, 1])
 *
 * @module axisUtils
 */

import type { GridArea } from '../../../renderers/createGridRenderer';
import { clampInt } from './canvasUtils';

/**
 * Converts RGBA normalized [0-1] values to CSS rgba() string.
 *
 * @param rgba - Array of [r, g, b, a] in range [0, 1]
 * @returns CSS rgba() string
 */
export const rgba01ToCssRgba = (rgba: readonly [number, number, number, number]): string => {
  const r = Math.max(0, Math.min(255, Math.round(rgba[0] * 255)));
  const g = Math.max(0, Math.min(255, Math.round(rgba[1] * 255)));
  const b = Math.max(0, Math.min(255, Math.round(rgba[2] * 255)));
  const a = Math.max(0, Math.min(1, rgba[3]));
  return `rgba(${r},${g},${b},${a})`;
};

/**
 * Clamps value to [0, 1] range.
 *
 * @param v - Value to clamp
 * @returns Clamped value
 */
export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Linear interpolation between two values with clamped t.
 *
 * @param a - Start value
 * @param b - End value
 * @param t01 - Interpolation parameter in range [0, 1]
 * @returns Interpolated value
 */
export const lerp = (a: number, b: number, t01: number): number => a + (b - a) * clamp01(t01);

/**
 * Computes scissor rect in device pixels from grid margins.
 * Used for WebGPU scissor testing to clip rendering to plot area.
 *
 * @param gridArea - Grid area with margins and canvas dimensions
 * @returns Scissor rect with x, y, w, h in device pixels
 */
export const computePlotScissorDevicePx = (
  gridArea: GridArea
): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } => {
  const { canvasWidth, canvasHeight, devicePixelRatio } = gridArea;

  const plotLeftDevice = gridArea.left * devicePixelRatio;
  const plotRightDevice = canvasWidth - gridArea.right * devicePixelRatio;
  const plotTopDevice = gridArea.top * devicePixelRatio;
  const plotBottomDevice = canvasHeight - gridArea.bottom * devicePixelRatio;

  const scissorX = clampInt(Math.floor(plotLeftDevice), 0, Math.max(0, canvasWidth));
  const scissorY = clampInt(Math.floor(plotTopDevice), 0, Math.max(0, canvasHeight));
  const scissorR = clampInt(Math.ceil(plotRightDevice), 0, Math.max(0, canvasWidth));
  const scissorB = clampInt(Math.ceil(plotBottomDevice), 0, Math.max(0, canvasHeight));
  const scissorW = Math.max(0, scissorR - scissorX);
  const scissorH = Math.max(0, scissorB - scissorY);

  return { x: scissorX, y: scissorY, w: scissorW, h: scissorH };
};

/**
 * Converts clip-space X to canvas CSS pixels (from normalized [-1, 1]).
 *
 * @param xClip - X coordinate in clip space [-1, 1]
 * @param canvasCssWidth - Canvas width in CSS pixels
 * @returns X coordinate in canvas CSS pixels
 */
export const clipXToCanvasCssPx = (xClip: number, canvasCssWidth: number): number => ((xClip + 1) / 2) * canvasCssWidth;

/**
 * Converts clip-space Y to canvas CSS pixels (from normalized [-1, 1]).
 * Y-axis is flipped (1 is top, -1 is bottom).
 *
 * @param yClip - Y coordinate in clip space [-1, 1]
 * @param canvasCssHeight - Canvas height in CSS pixels
 * @returns Y coordinate in canvas CSS pixels
 */
export const clipYToCanvasCssPx = (yClip: number, canvasCssHeight: number): number => ((1 - yClip) / 2) * canvasCssHeight;
