# Annotations Cookbook

Practical recipes for ChartGPU annotations. Full API: [api/annotations.md](../api/annotations.md).

## Quick start

```ts
import { ChartGPU, createAnnotationAuthoring } from 'chartgpu';

const chart = await ChartGPU.create(container, { series: [{ type: 'line', data: myData }] });
const authoring = createAnnotationAuthoring(container, chart);
// Right-click to add/edit. Cleanup: authoring.dispose(); chart.dispose();
```

## Recipes

### Horizontal threshold
```ts
{ type: 'lineY', y: 100, layer: 'belowSeries', style: { color: '#ef4444', lineWidth: 2, lineDash: [8, 6] }, label: { text: 'Max' } }
```

### Vertical event marker
```ts
{ type: 'lineX', x: eventTimestamp, layer: 'belowSeries', style: { color: '#22c55e', lineWidth: 2 }, label: { text: 'Launch' } }
```

### Peak marker
```ts
{ type: 'point', x: maxX, y: maxY, layer: 'aboveSeries', marker: { symbol: 'circle', size: 10, style: { color: '#22c55e' } }, label: { template: 'Peak: {y}', decimals: 2 } }
```

### Plot-space HUD (watermark, status)
```ts
{ type: 'text', position: { space: 'plot', x: 0.95, y: 0.05 }, text: 'LIVE', layer: 'aboveSeries', style: { color: '#22c55e' } }
```

### Event timeline
```ts
const annotations = events.map(evt => ({
  type: 'lineX' as const, x: evt.timestamp, layer: 'belowSeries' as const,
  style: { color: evt.color, lineWidth: 2 }, label: { text: evt.label }
}));
chart.setOption({ ...chart.options, annotations });
```

### Programmatic management
```ts
authoring.addVerticalLine(x);
authoring.addTextNote(x, y, 'Note', 'data');
const json = authoring.exportJSON();
authoring.undo(); authoring.redo();
```

## Tips

- **Performance:** Keep visible annotations <30; batch updates in single `setOption(...)`.
- **Layer:** Use `belowSeries` for backgrounds, `aboveSeries` for highlights.
- **Lifecycle:** `authoring.dispose()` before `chart.dispose()`.

## See also

- [Annotations API](../api/annotations.md) — Full reference
- [Interaction API](../api/interaction.md) — Events, hit testing
- [Example: annotation-authoring](../../examples/annotation-authoring/)
