/**
 * Shared axis label styling utilities.
 */

/**
 * Theme configuration for axis labels.
 */
export interface AxisLabelThemeConfig {
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly textColor: string;
}

/**
 * Calculates the font size for axis titles (larger than regular tick labels).
 */
export function getAxisTitleFontSize(baseFontSize: number): number {
  return Math.max(baseFontSize + 1, Math.round(baseFontSize * 1.15));
}
