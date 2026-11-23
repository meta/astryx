# @astryxdesign/lab

# 0.1.9

---

# 0.1.8

---

# 0.1.7

---

# 0.1.6

---

# 0.1.5

---

# 0.1.4

---

# 0.1.3

---

# 0.1.2

---

# 0.1.1

---

# 0.1.0

---

# 0.0.15

#### Breaking Changes

- **Fully unprefixed** — `@astryxdesign/lab` drops the `XDS*` prefix entirely (no compat aliases): import `Stepper`, `Step`, `ChartV2`, `Schedule`, etc. directly. (#2954)

#### New Components

- **Stepper / Step** — Moved here from `@astryxdesign/core` for an API rework; visual overhaul with a segmented bar, indicator modes, and density. (#2335, #2308)
- **Schedule** — New scheduling component. (#2366)

#### New Features

- **ChartV2** — New v2 axis + grid with composable styling, plus tooltip, axis formatters, and tick controls. (#2287, #2189)

#### Fixes

- Adopt `handleRef` for imperative component handles, and rebrand internal SVG ids `xds-` → `astryx-`. (#2363, #2952)

# 0.0.13

#### New Features

- **XDSChart** — Composable d3-based chart components (#1389)
- **XDSChartColors** — Palette accessor for data visualization (#1388)
- **XDSSankeyChart** — Ribbon-based flow visualization (#1516)
- **Advanced charts** — WebGL, streaming, confidence intervals, candlestick (#1397)
- **Radial charts + 3D charts** + `useXDSChartRange` (#1440)
- **Chart interactions** — brush, crosshair, zoom, select, highlight, reference lines (#1463)
- **Chart v2 architecture** — config model with series renderers (#1548, #1730)

#### Fixes

- Chart Tier 1 correctness — xKey in context, bars from zero (#1402)
- Chart Tier 2 — remove hardcoded colors, document DPR contract (#1424)
- Rewrite zoom/pan + fix yDomain ratcheting (#1527)
- Merge Crosshair into Tooltip, use XDS Layer for top-layer rendering (#1514)
- CodeEditor: perf/theme stories, remove span fallback (#1470)
- CodeBlock: per-line tokens, skip default color, fix `::highlight` selectors (#1369)

#### Patch Changes

- Updated dependencies
  - @astryxdesign/core@0.0.13

---

# 0.0.5

#### Patch Changes

- Updated dependencies
  - @astryxdesign/core@0.0.5
