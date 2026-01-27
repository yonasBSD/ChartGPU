/**
 * Public API for worker thread integration.
 *
 * This module provides the message protocol types and utilities for communicating
 * with ChartGPU running in a Web Worker with OffscreenCanvas.
 *
 * @module chartgpu/worker
 */

// =============================================================================
// Protocol Types
// =============================================================================

// Discriminated unions for all messages
export type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from './protocol';

// Inbound message types (Main → Worker)
export type {
  InitMessage,
  SetOptionMessage,
  AppendDataMessage,
  AppendDataBatchMessage,
  ResizeMessage,
  ForwardPointerEventMessage,
  SetZoomRangeMessage,
  SetInteractionXMessage,
  SetAnimationMessage,
  DisposeMessage,
} from './protocol';

// Outbound message types (Worker → Main)
export type {
  ReadyMessage,
  RenderedMessage,
  TooltipUpdateMessage,
  LegendUpdateMessage,
  AxisLabelsUpdateMessage,
  WorkerEventPayload,
  HoverChangeMessage,
  ClickMessage,
  CrosshairMoveMessage,
  ZoomChangeMessage,
  DeviceLostMessage,
  DisposedMessage,
  ErrorMessage,
} from './protocol';

// =============================================================================
// Protocol Utilities
// =============================================================================

export { getTransferables } from './protocol';

// =============================================================================
// Re-exported Types from Main Library
// =============================================================================

// Configuration types used in protocol messages
export type {
  ChartGPUOptions,
  AnimationConfig,
  PointerEventData,
  TooltipData,
  LegendItem,
  AxisLabel,
} from '../config/types';
