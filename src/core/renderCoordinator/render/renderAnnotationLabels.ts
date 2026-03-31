/**
 * Annotation Label Rendering Utilities
 *
 * Generates DOM-based annotation labels for cartesian charts.
 * Handles template rendering, coordinate transformations, and styling
 * for lineX, lineY, point, and text annotations.
 *
 * @module renderAnnotationLabels
 */

import type { ResolvedChartGPUOptions } from '../../../config/OptionResolver';
import type { LinearScale } from '../../../utils/scales';
import type { TextOverlay, TextOverlayAnchor } from '../../../components/createTextOverlay';
import { parseCssColorToRgba01 } from '../../../utils/colors';
import { clamp01 } from '../utils/axisUtils';
import { assertUnreachable } from '../utils/dataPointUtils';

export interface AnnotationLabelRenderContext {
  currentOptions: ResolvedChartGPUOptions;
  xScale: LinearScale;
  yScale: LinearScale;
  canvasCssWidthForAnnotations: number;
  canvasCssHeightForAnnotations: number;
  plotLeftCss: number;
  plotTopCss: number;
  plotWidthCss: number;
  plotHeightCss: number;
  canvas: HTMLCanvasElement;
}

interface AnnotationLabelData {
  text: string;
  x: number;
  y: number;
  anchor: TextOverlayAnchor;
  color: string;
  fontSize: number;
  background?: {
    backgroundColor: string;
    padding?: readonly [number, number, number, number];
    borderRadius?: number;
  };
}

function isHTMLCanvasElement(canvas: HTMLCanvasElement): canvas is HTMLCanvasElement {
  return 'offsetLeft' in canvas;
}

function clipToCanvasCssPx(valueClip: number, canvasCssSize: number, invert = false): number {
  return invert ? ((1 - valueClip) / 2) * canvasCssSize : ((valueClip + 1) / 2) * canvasCssSize;
}

function toCssRgba(color: string, opacity01: number): string {
  const base = parseCssColorToRgba01(color) ?? ([0, 0, 0, 1] as const);
  const a = clamp01(base[3] * clamp01(opacity01));
  const r = Math.round(clamp01(base[0]) * 255);
  const g = Math.round(clamp01(base[1]) * 255);
  const b = Math.round(clamp01(base[2]) * 255);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function formatNumber(n: number, decimals?: number): string {
  if (!Number.isFinite(n)) return '';
  if (decimals == null) return String(n);
  const d = Math.min(20, Math.max(0, Math.floor(decimals)));
  return n.toFixed(d);
}

// PERFORMANCE: Cache regex pattern (compiled once per render, reused for all templates)
const templateRegex = /\{(x|y|value|name)\}/g;

function renderTemplate(
  template: string,
  values: Readonly<{ x?: number; y?: number; value?: number; name?: string }>,
  decimals?: number
): string {
  // PERFORMANCE: Reset regex lastIndex to ensure consistent behavior
  templateRegex.lastIndex = 0;
  return template.replace(templateRegex, (_m, key) => {
    if (key === 'name') return values.name ?? '';
    const v = (values as any)[key] as number | undefined;
    return v == null ? '' : formatNumber(v, decimals);
  });
}

function mapAnchor(anchor: 'start' | 'center' | 'end' | undefined): TextOverlayAnchor {
  switch (anchor) {
    case 'center':
      return 'middle';
    case 'end':
      return 'end';
    case 'start':
    default:
      return 'start';
  }
}

function getLabelText(
  annotation: {
    type: 'lineX' | 'lineY' | 'point' | 'text';
    text?: string;
    id?: string;
    label?: {
      text?: string;
      template?: string;
      decimals?: number;
    } | null;
  },
  values: Readonly<{ x?: number; y?: number; value?: number; name?: string }>
): string {
  const labelCfg = annotation.label;
  if (labelCfg?.text != null) return labelCfg.text;
  if (labelCfg?.template != null) return renderTemplate(labelCfg.template, values, labelCfg.decimals);
  if (!labelCfg) return annotation.type === 'text' ? (annotation.text ?? '') : '';

  const defaultTemplate =
    annotation.type === 'lineX'
      ? 'x={x}'
      : annotation.type === 'lineY'
        ? 'y={y}'
        : annotation.type === 'point'
          ? '({x}, {y})'
          : (annotation.text ?? '');

  return defaultTemplate.includes('{') ? renderTemplate(defaultTemplate, values, labelCfg.decimals) : defaultTemplate;
}

function getBackgroundStyle(
  background:
    | {
        color?: string;
        opacity?: number;
        padding?: number | readonly [number, number, number, number];
        borderRadius?: number;
      }
    | undefined
): AnnotationLabelData['background'] | undefined {
  if (!background) return undefined;

  const backgroundColor = background.color != null ? toCssRgba(background.color, background.opacity ?? 1) : undefined;
  if (!backgroundColor) return undefined;

  const padding = (() => {
    const p = background.padding;
    if (typeof p === 'number' && Number.isFinite(p)) return [p, p, p, p] as const;
    if (Array.isArray(p) && p.length === 4 && p.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return [p[0], p[1], p[2], p[3]] as const;
    }
    return [2, 4, 2, 4] as const;
  })();

  return {
    backgroundColor,
    ...(padding ? { padding } : {}),
    ...(typeof background.borderRadius === 'number' && Number.isFinite(background.borderRadius)
      ? { borderRadius: background.borderRadius }
      : {}),
  };
}

/**
 * Renders annotation labels to the text overlay.
 *
 * Processes annotations and generates DOM labels with template support,
 * coordinate transformations, and background styling.
 *
 * @param annotationOverlay - Text overlay for rendering labels
 * @param overlayContainer - DOM container for overlay positioning
 * @param context - Rendering context with scales, options, and layout
 */
export function renderAnnotationLabels(
  annotationOverlay: TextOverlay | null,
  overlayContainer: HTMLElement | null,
  context: AnnotationLabelRenderContext
): void {
  const {
    currentOptions,
    xScale,
    yScale,
    canvasCssWidthForAnnotations,
    canvasCssHeightForAnnotations,
    plotLeftCss,
    plotTopCss,
    plotWidthCss,
    plotHeightCss,
    canvas,
  } = context;

  const hasCartesianSeries = currentOptions.series.some((s) => s.type !== 'pie');
  if (!hasCartesianSeries || !annotationOverlay || !overlayContainer) {
    return;
  }

  // Validate canvas dimensions
  if (
    !canvas ||
    canvasCssWidthForAnnotations <= 0 ||
    canvasCssHeightForAnnotations <= 0 ||
    plotWidthCss <= 0 ||
    plotHeightCss <= 0
  ) {
    annotationOverlay.clear();
    return;
  }

  const offsetX = isHTMLCanvasElement(canvas) ? canvas.offsetLeft : 0;
  const offsetY = isHTMLCanvasElement(canvas) ? canvas.offsetTop : 0;

  annotationOverlay.clear();

  const annotations = currentOptions.annotations ?? [];
  if (annotations.length === 0) {
    return;
  }

  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i]!;

    const labelCfg = a.label;
    const wantsLabel = labelCfg != null || a.type === 'text';
    if (!wantsLabel) continue;

    // Compute anchor point (canvas-local CSS px)
    let anchorXCss: number | null = null;
    let anchorYCss: number | null = null;
    let values: { x?: number; y?: number; value?: number; name?: string } = { name: a.id ?? '' };

    switch (a.type) {
      case 'lineX': {
        const xClip = xScale.scale(a.x);
        const xCss = clipToCanvasCssPx(xClip, canvasCssWidthForAnnotations);
        anchorXCss = xCss;
        anchorYCss = plotTopCss;
        values = { ...values, x: a.x, value: a.x };
        break;
      }
      case 'lineY': {
        const yClip = yScale.scale(a.y);
        const yCss = clipToCanvasCssPx(yClip, canvasCssHeightForAnnotations, true);
        anchorXCss = plotLeftCss;
        // Offset label 8px above the horizontal line (negative Y = upward)
        anchorYCss = yCss - 8;
        values = { ...values, y: a.y, value: a.y };
        break;
      }
      case 'point': {
        const xClip = xScale.scale(a.x);
        const yClip = yScale.scale(a.y);
        const xCss = clipToCanvasCssPx(xClip, canvasCssWidthForAnnotations);
        const yCss = clipToCanvasCssPx(yClip, canvasCssHeightForAnnotations, true);
        anchorXCss = xCss;
        anchorYCss = yCss;
        values = { ...values, x: a.x, y: a.y, value: a.y };
        break;
      }
      case 'text': {
        if (a.position.space === 'data') {
          const xClip = xScale.scale(a.position.x);
          const yClip = yScale.scale(a.position.y);
          const xCss = clipToCanvasCssPx(xClip, canvasCssWidthForAnnotations);
          const yCss = clipToCanvasCssPx(yClip, canvasCssHeightForAnnotations, true);
          anchorXCss = xCss;
          anchorYCss = yCss;
          values = { ...values, x: a.position.x, y: a.position.y, value: a.position.y };
        } else {
          const xCss = plotLeftCss + a.position.x * plotWidthCss;
          const yCss = plotTopCss + a.position.y * plotHeightCss;
          anchorXCss = xCss;
          anchorYCss = yCss;
          values = { ...values, x: a.position.x, y: a.position.y, value: a.position.y };
        }
        break;
      }
      default:
        assertUnreachable(a);
    }

    if (anchorXCss == null || anchorYCss == null || !Number.isFinite(anchorXCss) || !Number.isFinite(anchorYCss)) {
      continue;
    }

    // Cull annotations that are far outside the visible plot area (performance + visual cleanup)
    const cullMargin = 200; // px margin for labels near edges
    if (
      anchorXCss < plotLeftCss - cullMargin ||
      anchorXCss > plotLeftCss + plotWidthCss + cullMargin ||
      anchorYCss < plotTopCss - cullMargin ||
      anchorYCss > plotTopCss + plotHeightCss + cullMargin
    ) {
      continue;
    }

    const dx = labelCfg?.offset?.[0] ?? 0;
    const dy = labelCfg?.offset?.[1] ?? 0;
    const x = anchorXCss + dx;
    const y = anchorYCss + dy;

    // Label text selection (explicit > template > defaults)
    const text = getLabelText(a, values);

    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (trimmed.length === 0) continue;

    const anchor = mapAnchor(labelCfg?.anchor);
    const color = a.style?.color ?? currentOptions.theme.textColor;
    const fontSize = currentOptions.theme.fontSize;

    const background = getBackgroundStyle(labelCfg?.background);

    const labelData: AnnotationLabelData = {
      text: trimmed,
      x: offsetX + x,
      y: offsetY + y,
      anchor,
      color,
      fontSize,
      ...(background ? { background } : {}),
    };

    // Render label to DOM
    const span = annotationOverlay.addLabel(trimmed, labelData.x, labelData.y, {
      fontSize,
      color,
      anchor,
    });

    if (labelData.background) {
      span.style.backgroundColor = labelData.background.backgroundColor;
      span.style.display = 'inline-block';
      span.style.boxSizing = 'border-box';
      if (labelData.background.padding) {
        const [t, r, b, l] = labelData.background.padding;
        span.style.padding = `${t}px ${r}px ${b}px ${l}px`;
      }
      if (labelData.background.borderRadius != null) {
        span.style.borderRadius = `${labelData.background.borderRadius}px`;
      }
    }
  }
}
