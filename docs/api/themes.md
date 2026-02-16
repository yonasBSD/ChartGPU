# Themes

## `ThemeConfig`

Theme configuration type for chart colors, palette, and typography. Used by `ChartGPUOptions.theme`.

| Property | Description |
|----------|-------------|
| `backgroundColor` | Canvas background |
| `textColor` | Axis labels, legend |
| `axisLineColor`, `axisTickColor`, `gridLineColor` | Axis/grid styling |
| `colorPalette` | Default series colors (when `series.color` not set) |
| `fontFamily`, `fontSize` | Text styling |

See [`types.ts`](../../src/themes/types.ts).

## Presets

- **`'dark'`** (default), **`'light'`** — string presets
- **`darkTheme`**, **`lightTheme`** — exported `ThemeConfig` objects
- **`getTheme(name)`** — returns preset by name

## Usage

```ts
// Preset
theme: 'dark' | 'light'

// Partial override (merges onto dark)
theme: { backgroundColor: '#1e1e2e', colorPalette: ['#ff6b9d'] }

// Palette-only (replaces theme.colorPalette)
theme: 'dark', palette: ['#FF6384', '#36A2EB']
```

Color precedence: `lineStyle.color` / `areaStyle.color` > `series.color` > `theme.colorPalette`.
