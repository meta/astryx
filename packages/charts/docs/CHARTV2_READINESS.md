# @astryxdesign/charts — Launch Readiness Audit

Full inventory of what the package contains today and how ready each piece is to
ship (canary), based on the API audit, the verification checklist, and the Stage 1
fixes already landed on `feat/charts-extraction`. Goal: pick a solid first slice to
ship soon (coordinated with the vega launch), and track the rest as fast-follows.

Readiness legend:

- **Ship-ready** — verified working, fixes landed, low risk for canary.
- **Minor polish** — works; needs 1–2 small fixes and/or a story before it's presentable.
- **Needs work** — architectural gap or unverified interaction; not for the first slice.

Bar for "ready" = canary quality: works, looks right in light + dark, reasonable API,
has a story. (Not full stable/a11y bar — that's later.)

---

## Marks (12)

| Mark               | What it is                                            | Readiness      | Notes / blockers                                                                                            |
| ------------------ | ----------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| `bar`              | Bars: simple/stacked/grouped/grouped-stacked/negative | **Ship-ready** | All variants verified L+D; `_uid` + color fixes landed                                                      |
| `line`             | Line series (curves, optional dots)                   | **Ship-ready** | Edge-clip + headroom fixed                                                                                  |
| `area`             | Area fill (+gradient, stacked)                        | **Ship-ready** | Gradient-id collision fixed                                                                                 |
| `dot`              | SVG scatter                                           | **Ship-ready** | `dodge` implemented; story added                                                                            |
| `band`             | Confidence-interval band                              | Minor polish   | Utility (no legend); translucent fill washes out in dark                                                    |
| `candlestick`      | OHLC financial                                        | Minor polish   | Semantic default colors now; not in legend by default; tooltip shows only the `open` value                  |
| `errorBar`         | Whisker/error bars                                    | Minor polish   | Utility; dark custom color (#1e3a5f) washes out on dark                                                     |
| `referenceLine`    | Annotation line/band at fixed x or y                  | Minor polish   | Label clamp fixed; needs solo stories; `x` only on linear scale                                             |
| `dotGL`            | WebGL scatter (large N)                               | Minor polish   | Works; hex-only color (not palette/token integrated)                                                        |
| `streamGL`         | WebGL streaming line (imperative push)                | Minor polish   | Renders now with a domain window; niche; needs a documented usage pattern                                   |
| `dotGLInteractive` | WebGL scatter + GPU-picking hover                     | **Needs work** | Hover interaction never exercised by a story / unverified                                                   |
| `heatmapGL`        | WebGL 2D heatmap                                      | **Needs work** | Builds its own categorical y-scale (breaks the shared-scale rule); top-row clip; hex ramp isn't token-aware |

## Chrome (6)

| Component      | What it is                                           | Readiness      | Notes / blockers                                                                                              |
| -------------- | ---------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| `Chart`        | Root: layout, scales, domains, clip, palette, events | **Ship-ready** | Strong; domains/baseline/streaming/palette all landed                                                         |
| `ChartAxis`    | Axes (ticks, formatters, density)                    | **Ship-ready** | Label auto-density fixed; time axis + top/right/`showTicks` combos less tested (minor)                        |
| `ChartGrid`    | Grid lines (h/v)                                     | **Ship-ready** | —                                                                                                             |
| `ChartLegend`  | Legend (positions, alignment)                        | **Ship-ready** | Accessor/auto-color series now appear                                                                         |
| `ChartSwatch`  | Color swatch primitive                               | **Ship-ready** | Component fine; story under-demonstrates (cosmetic)                                                           |
| `ChartTooltip` | Grouped hover tooltip + crosshair                    | Minor polish   | Core works but hover interaction isn't screenshot-verified; value semantics wrong for candlestick/streamGL/GL |

## Utilities

| Util                                                    | Readiness      | Notes                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useChartColors` / `getChartColors` (palette)           | **Ship-ready** | Solid; resolves concrete palette colors for Canvas/non-CSS paths. CSS-capable `dataVars` consumers get `--color-data-*` variables from Core CSS in prebuilt mode. Concrete resolution uses `resolveThemeToken()` / `useTheme().token()`. |
| `currency` formatter                                    | **Ship-ready** | Verified on an axis                                                                                                                                                                                                                      |
| `percent` / `compactNumber` / `shortDate` / `monthYear` | Minor polish   | Not yet verified in a story                                                                                                                                                                                                              |

---

## Recommended first slice (ship to canary next week, with vega)

Everything in this set is **Ship-ready** and covers the "few basic charts" people
have been asking for:

- **Marks:** `bar`, `line`, `area`, `dot`
- **Chrome:** `Chart`, `ChartAxis`, `ChartGrid`, `ChartLegend`, `ChartSwatch`, `ChartTooltip`*
- **Utilities:** the color palette + `currency`

\* Tooltip's static rendering is fine; before shipping, do one pass of hover
verification (it's the one interaction we haven't screenshot-tested).

**Stretch (nice for a compelling demo, small effort):** `candlestick` — a strong
financial showcase; just needs the legend/tooltip-value polish. And confirm the
remaining formatters render.

To actually ship this slice, the remaining work is small:

1. Verify tooltip hover (Playwright-drive a hover) — the last unverified interaction.
2. Confirm `percent`/date formatters in a story.
3. Wire `/charts` into the docsite (add as a dep, fill the empty `.doc.mjs` files) so it appears in docs.
4. Final light+dark screenshot pass of the slice.

## Fast-follows (after the first slice)

- `heatmapGL` categorical-y shared-scale fix (the architectural exception).
- `dotGLInteractive` hover story + verification.
- Mode-aware translucent fills so bands/error bars read in dark mode.
- Tooltip value semantics for candlestick (OHLC) / streamGL / GL marks.
- `dotGL` palette/token color integration.
- Time scale + date-axis formatting.
- `referenceLine` solo stories; edge-case stories (empty/single/all-zero/outlier).
- Tests (unit + export-surface + SSR) and a11y pass.
- Cross-chart interactivity broker — owned by indigo; keep `Chart`'s container
  context + pointer stream clean as the integration seam.
