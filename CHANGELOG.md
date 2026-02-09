# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Horizontal scroll panning** - Touchpad users can now pan the chart view by scrolling left/right. The zoom handler now detects horizontal scroll dominance and performs pan operations accordingly.
- **Annotation color picker visual indicator** - Color picker in annotation configuration dialog now displays a checkmark icon, dual-layer border highlighting, and elevation effect on the selected color for clear visual feedback.

### Changed
- **Render-on-demand performance** - Charts no longer re-render continuously at 60fps when idle. Rendering now only occurs when `requestRender()` is called (triggered automatically by chart interactions and data changes), significantly reducing CPU and GPU usage to near 0% when idle. The Million Points example now includes a "Benchmark mode" toggle to switch between continuous rendering (for performance measurement) and render-on-demand (for idle efficiency).
- **Annotation authoring example improvements** - Updated the annotation authoring example with bell curve data generation to position the peak point in the center of the chart, and added explicit Y-axis bounds (min: -0.2, max: 1.0) to provide proper spacing and prevent peak points from appearing at the extreme top edge.

### Deprecated

### Removed
- **Annotation authoring toolbar** - Removed undo/redo/export JSON toolbar buttons from the annotation authoring interface to streamline the UI and reduce visual clutter.

### Fixed
- **Hover interaction with hidden series** - Fixed critical bug where disabling a series via legend toggle prevented hovering over points in remaining visible series. The issue was caused by pre-filtering series arrays before calling hit-testing functions, which resulted in series index misalignment (indices relative to filtered array instead of original array). Now passes unfiltered series arrays to all hit-testing functions (`findNearestPoint`, `findPointsAtX`, `findPieSliceAtPointer`, `findCandlestickAtPointer`), which handle visibility filtering internally and return correct series indices. Also added index mapping to `findNearestPoint` for non-bar cartesian series to ensure correctness even when called with filtered arrays. Applies to all chart types (line, area, scatter, bar, candlestick, pie).
- **Single visible pie slice rendering** - Fixed bug where having only one visible series/slice in a pie chart rendered as a thin vertical sliver instead of a complete circle. The pie renderer now correctly handles the edge case where a single slice should span the full 360 degrees without angle wrapping.
- **Bar chart series visibility** - Fixed bug where clicking to disable a bar series in the legend didn't actually hide the bars. The bar renderer now filters out hidden series before preparation, matching the behavior of line, area, and pie renderers.
- **Animation retriggering on legend toggle** - Fixed issue where toggling series visibility via legend clicks did not retrigger the startup animation. The chart now resets the intro animation phase to 'pending' when visibility changes occur after the initial animation completes, causing the chart to animate in from scratch with each visibility toggle. Applies to all chart types with startup animations (bar, scatter, pie/donut).
- **Animation interruption during legend toggle** - Fixed issue where ongoing animations (startup/intro, data update) were interrupted when clicking legend items to toggle series visibility. The chart now preserves ongoing intro animations during visibility-only changes and skips starting conflicting update animations.
- **Legend toggle render delay** - Fixed issue where clicking legend items to hide/show series didn't update immediately when animations were enabled. The chart now triggers an initial render when starting update animations, ensuring legend toggles take effect immediately without requiring mouse movement.
- **Scissor rect clipping during zoom** - Fixed visual bug where chart data extended past axis boundaries during zoom interactions. Scissor rects are now applied consistently to line and area renderers during all rendering operations, not just intro animations.
- **Grouped bar layout** - Fixed grouped/clustered bar rendering so bars stay clipped to the plot grid and do not overlap within a category. Also tightened the default intra-group spacing (`barGap`) for a more "flush" grouped look (see `examples/grouped-bar`).
- **Annotation color picker selection** - Fixed color comparison logic in annotation color picker that prevented the visual selection indicator from appearing. Now uses data attributes for reliable color matching instead of computed RGB styles.

### Security

## [0.1.0] - YYYY-MM-DD

Initial release of ChartGPU - a GPU-accelerated charting library built with WebGPU for high-performance data visualization in the browser.

### Added

#### Chart Types
- **Line charts** - GPU-accelerated line rendering with customizable styles
- **Area charts** - Filled area visualization with opacity control
- **Bar charts** - Clustered and stacked bar charts with flexible grouping
- **Scatter plots** - Point-based visualization for large datasets
- **Pie and donut charts** - Circular charts with configurable inner radius

#### Interactivity
- **Hover highlighting** - Visual feedback with highlight ring on data point hover
- **Tooltip system** - Configurable tooltips with item and axis trigger modes, custom formatters, and HTML content support (use with caution for XSS safety)
- **Crosshair** - Visual guides following cursor position
- **Event system** - Chart events including `click`, `mouseover`, `mouseout`, and `crosshairMove`
- **Hit testing** - Accurate point detection for cartesian charts (nearest point), bar charts (bounding box), and pie charts (slice detection)
- **Multi-chart synchronization** - Coordinate interactions across multiple charts using `connectCharts(...)`

#### Data Handling
- **Streaming updates** - Append new data points dynamically via `appendData(...)` for cartesian charts
- **Auto-scroll** - Automatic viewport adjustment for streaming data scenarios
- **Data sampling** - Built-in algorithms (LTTB, average, max, min, none) with zoom-aware resampling and debounce optimization
- **Large dataset support** - Examples demonstrate rendering up to 5 million candlesticks at over 100 FPS

#### Zoom & Navigation
- **X-axis data zoom** - Interactive zoom with inside gestures including wheel zoom and pan
- **Data zoom slider** - Optional UI component for zoom range selection

#### Visual Customization
- **Animation system** - Smooth initial intro animations and data update transitions with configurable easing options
- **Theme support** - Built-in dark and light themes plus custom theme creation
- **Automatic legend** - Dynamic legend generation displaying series names and colors
- **Axis and grid rendering** - GPU-rendered axes and grid with DOM text overlay for labels

#### Core Features
- **WebGPU-powered rendering** - Hardware-accelerated graphics for optimal performance
- **TypeScript support** - Full type definitions and TypeScript-first development
- **Functional API** - Immutable state management with pure functions
- **Comprehensive examples** - Working examples for all chart types and features

### Requirements

**WebGPU Browser Support:**
- Chrome/Chromium 113 or later
- Microsoft Edge 113 or later
- Safari 18 or later
- Firefox: Not yet supported

WebGPU is required to run ChartGPU. Ensure your browser supports WebGPU before using this library.

[Unreleased]: https://github.com/hunterg325/ChartGPU/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/hunterg325/ChartGPU/releases/tag/v0.1.0
