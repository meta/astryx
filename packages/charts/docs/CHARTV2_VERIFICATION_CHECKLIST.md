# ChartV2 — Verification Checklist

Exhaustive, specific things to verify before we call the chart library "correct." This
is the QA backbone for Stage 1 (fixes) and Stage 2 (tests). It combines (a) what the
screenshot pass already checked and (b) everything still untested.

Status legend:

- `[ok]` verified acceptable in the light+dark screenshot review of all 21 stories
- `[BUG]` confirmed problem (tracked in Stage 1)
- `[?]` not yet verified — needs a check and/or a dedicated story
- `[new]` needs a new story/fixture to even exercise it

How we verify:

- **Visual**: Playwright screenshot harness over every story, light + dark (existing).
- **Unit**: vitest on layout/scales/color/legend/tooltip/formatters.
- **Manual**: hover/keyboard/resize interactions Playwright can drive.
- **SSR**: render-to-string smoke test.

---

## 1. Axes ("are all axes good?")

### Positions & structure

- `[ok]` Bottom axis renders a baseline line; labels centered under band categories.
- `[ok]` Left axis renders as floating labels (no line, no ticks) by default.
- `[?]` Confirm the floating y-axis (no line/no ticks by default) is the INTENDED default
  look vs. drawing a subtle axis line/ticks. (Design call — looks Google-Sheets clean.)
- `[?]` Right axis (`position="right"`) — placement, label anchor (start), used for
  secondary-axis story. `[new]`
- `[?]` Top axis (`position="top"`) — label placement above plot. `[new]`
- `[?]` `showAxisLine` / `showTicks` toggles in every combination (line-only,
  line+ticks, ticks force line on). `[new]` dedicated story.

### Ticks & density

- `[BUG]` Band axis with many categories overlaps into a smear (candlestick, 30 days).
  Needs width-aware auto-skip without requiring `maxTicks`.
- `[?]` `tickCount` respected for linear axes (d3 picks "nice" counts near it).
- `[?]` `maxTicks` evenly skips labels when exceeded (verify the every-Nth logic).
- `[?]` Long category labels — truncation (`truncate`) appends "…"; consider rotation.
- `[new]` Rotated labels option for dense/long band labels (currently none).
- `[?]` First/last linear tick not clipped at plot edges (edge visibility guard exists —
  offset within [-10, width+10]).
- `[?]` Gridlines align exactly with axis tick positions (grid uses `yScale.ticks(5)`;
  axis uses `tickCount=5` — confirm they match when `tickCount` changes).

### Domains reflected in axis

- `[ok]` Negative y domain: bottom axis line drawn at y=0, not chart edge (NegativeValues).
- `[ok]` Currency formatter on left axis ($ values) renders (SimpleBar).
- `[?]` Percent / compactNumber / shortDate / monthYear formatters on axes. `[new]`
- `[BUG]` Continuous y (line/area/dot) glues min/max to top/bottom edges (no headroom).
- `[new]` Time axis: Date x-values with sensible date ticks + formatting (no time scale today).
- `[new]` Log axis: decade ticks (1,10,100…) (no log scale today).
- `[?]` Zero-range / single-value domain: axis still shows sane ticks (not all same).

### Axis appearance

- `[ok]` Axis label text color adapts in dark mode (secondary text token).
- `[?]` Axis line / tick contrast on both light and dark bodies.
- `[?]` RTL: left/right axis sides + label anchors mirror. `[new]`
- `[?]` Streaming: axis tick slide animation (`animated`) is smooth and honors
  reduced-motion. `[new]`

---

## 2. Scales & domains

- `[BUG]` Empty data → band fallback → NaN → blank (breaks streaming).
- `[BUG]` No `yBaseline`/`yDomain`/`xDomain` control (v1 parity).
- `[new]` Single datum → domain must synthesize a span; point centered/visible.
- `[new]` All-equal / zero-range values → padded domain, sane ticks.
- `[new]` All zero → baseline correct, bars flat at 0.
- `[new]` All negative → bars grow downward from 0; axis line at 0 (top).
- `[new]` One huge outlier → document/log remedy; linear still not throwing.
- `[?]` `nice()` behavior: applied for auto domains, NOT for explicit domains (avoid
  ratcheting during zoom/stream).
- `[?]` x numeric vs band inference correctness (all-number → linear; else band).
- `[new]` Explicit scale config (`type: 'linear'|'band'|'time'|'log'`) overrides inference.
- `[new]` Secondary y-axis (`axis:'y2'`) maps a mark to its own domain (financial).
- `[?]` Stacked domain = sum of stack (verified visually on StackedBars/Areas); unit-test it.
- `[?]` Mixed positive/negative stacks compute correct extents.

---

## 3. Colors & palette ("colors?")

### Palette correctness

- `[BUG]` Default color tokens (`--color-chart-1`, `--color-positive/negative`) don't
  exist → black/invisible when no color passed. Fix: auto-assign categorical by index.
- `[?]` `categorical(n)` returns distinct hues in series order; matches legend swatches.
- `[?]` `sequential[hue](n)` ramp ordering (dark→light) for heatmaps/choropleth.
- `[?]` `diverging.positiveNegative/coldHot/custom` around a midpoint.
- `[?]` `semantic` (positive/negative/warning/neutral) drive candlestick up/down,
  reference lines, error bars (not raw tokens).
- `[?]` `structural` (axis/grid/tick/label) used by chrome, theme-aware.
- `[?]` `alpha(hex, o)` produces correct rgba.

### Dark mode & contrast

- `[ok]` Solid SVG marks (bar/line/area-line/dot) and GL scatter dots read with good
  contrast on the dark body (reviewed: bars, line, scatter, candlestick, heatmap).
- `[BUG]` **Translucent / dark-hued fills wash out on dark — broad.** Reviewed in dark:
  confidence bands (opacity 0.1–0.2) nearly invisible; kitchen-sink reference bands
  (amber 0.15 / green 0.08) go muddy; area-gradient fill very dark; **error bars
  (`#1e3a5f`) nearly invisible on dark bars**; financial volume bars (gray 0.3) muddy.
  Root cause: colors/opacities are chosen for a light background (often hardcoded hex),
  not mode-aware. Fix at the palette/semantic level (mode-aware fill base + opacity;
  error-bar/structural defaults from theme tokens, not hex).
- `[ok]` Categorical mid-tones read acceptably on dark for the ones exercised (blue/red/
  orange/green). Still `[?]` for the full 10 (cyan/teal/brown/indigo/purple/pink) on dark.
- `[ok]` Heatmap sequential ramp low-end (near-white) reads fine on dark (high contrast);
  BUT note it's a story-supplied hex range, not a theme token (see below).
- `[note]` **Heatmap `colorRange` and candlestick up/down colors are story-supplied hex,
  not theme tokens** → they don't adapt to light/dark. Consider defaulting heatmap to a
  sequential-ramp token set and candlestick to `semantic.positive/negative`.
- `[new]` CVD (color-blind) safety pass on the 10 categorical (deuter/protan/tritan);
  document a recommended max (~8) distinct series.

### Color application

- `[BUG]` Accessor-colored series vanish from the legend.
- `[new]` Color-by-field (`color:{field}`) → ordinal color scale + legend entries.
- `[BUG]` GL marks can't take tokens (`hexToGL` is hex-only) — need token→hex resolver.
- `[?]` Theme switch at runtime re-resolves colors, including cached GL hex.
- `[new]` >10 series → palette recycles + dev warning.
- `[?]` Opacity: stacked/overlapping fills (area 0.3, band 0.15) composite correctly.
- `[?]` Gradient fill (area `gradient`) stops from color→transparent; unique per series
  (gradient id collision when two areas share a dataKey → dedupe via `_uid`).
- `[?]` Swatch color exactly matches the rendered series color (square for bar, line else).
- `[BUG-story]` The Swatch story renders only a single square — it under-demonstrates
  (no `line` variant, no multiple colors, no dark comparison). Expand the story.

---

## 4. Legend

- `[ok]` Standalone legend renders items with swatches + labels (Legend story).
- `[ok]` Positions top/bottom (horizontal wrap) and start/end (vertical stack).
- `[BUG]` `legend="end"` shrinks the plot but the last bar/label clips (MixedMarks).
- `[?]` Alignment start/center/end within position.
- `[?]` Utility marks (band/errorBar/referenceLine) correctly EXCLUDED from legend.
- `[BUG]` Marks with no `SeriesDef.color` (candlestick/GL) excluded — after color fix,
  decide which should appear (candlestick up/down? GL series?).
- `[new]` Many-series legend overflow (wrap/scroll), long labels.
- `[?]` Legend swatch variant matches mark type (bar=square, others=line).
- `[?]` Duplicate labels don't collide as React keys (legend keys on `label`).

---

## 5. Tooltip & hover (largely UNTESTED — screenshots are static)

- `[?]` Hover shows crosshair for line/area/dot; band-highlight rect for bars.
- `[?]` Tooltip card content: correct series rows, labels, colors, values at hovered x.
- `[BUG-latent]` Tooltip value = `datum[dataKeys[0]]`: candlestick shows only `open`;
  streamGL yields `undefined`; GL scatter creates rows. Fix per-mark tooltip semantics.
- `[?]` Hover dots render for line/area/dot at the focused index; skipped for bars/utility.
- `[?]` Card flips/clamps near viewport edges (placement auto/left/right/top).
- `[?]` Re-render only on data-index change (perf) — verify no per-move React renders.
- `[?]` Tooltip in dark mode (popover bg, text, swatch).
- `[?]` `dotGLInteractive` GPU-picking hover fires its own `renderTooltip`; ensure it
  doesn't double up with the chrome tooltip.
- `[new]` Empty/pointer-leave clears the card and indicator.
- `[?]` Touch/pointer on mobile (touch-action) — no scroll interference.

---

## 6. Grid

- `[ok]` Horizontal grid default; aligns with y ticks; skips the y=0 line.
- `[?]` Vertical grid (`vertical`) for band (per category) and linear (ticks).
- `[?]` Grid contrast in dark mode (border-emphasized token).
- `[?]` Grid behind marks (render order) — never over data.

---

## 7. Per-mark rendering (all 12)

- `[ok]` `bar` — simple/stacked/grouped/grouped-stacked/negative; rounded top corners;
  corner radius only on stack top.
- `[ok]` `line` — curves (monotone default); optional dots (hardcoded r=3 — expose?).
- `[ok]` `area` — fill + gradient + stacked; top stroke.
- `[?]` `dot` (SVG scatter) — no dedicated story yet. `[new]`
- `[BUG]` `dot.dodge` — declared, does nothing.
- `[ok]` `band` — confidence interval between upper/lower.
- `[ok]` `candlestick` — up/down bodies + wicks; min body height.
- `[ok]` `errorBar` — stem + caps.
- `[ok]` `referenceLine` — single y, y+y2 band, x line (need solo stories). `[new]`
- `[BUG]` `referenceLine` label badge clips at right edge (Acceptable/Target).
- `[ok]` `dotGL` — WebGL scatter (200 pts).
- `[new]` `dotGLInteractive` — hover/picking not exercised by a story.
- `[BUG]` `heatmapGL` — builds its own y scale; top row clips; should share chart scale.
- `[BUG]` `streamGL` — blank (empty-data scale); hardcoded key collides for two streams.
- `[?]` Marks with x-scale requirements fail gracefully on the wrong scale
  (heatmap needs band; referenceLine.x needs linear; streamGL needs numeric).
- `[BUG]` Two series on the same dataKey collide (resolved map + React key) — dup-key.

---

## 8. Layout & responsiveness

- `[ok]` Title/subtitle render above chart; aria wired to `<title>`/`<desc>`.
- `[?]` Responsive width via ResizeObserver — resize from wide→narrow re-lays-out.
- `[?]` Container width 0 (initial mount) renders a placeholder, no crash.
- `[?]` Very small container (e.g. 150px) — axes/labels degrade gracefully.
- `[?]` `margin` overrides — insets applied; enough room for long axis labels.
- `[BUG]` `legend="end"` clips plot (see §4).
- `[?]` Multiple charts on one page don't share/leak ids (gradient/clip ids unique).

---

## 9. Data edge cases (need fixtures — §5 of design doc)

- `[new]` Empty `[]`, single row, two rows.
- `[new]` `null`/`undefined`/`NaN`/non-numeric in a numeric column → gap (line/area) /
  skip (points) + dev warning (per decision).
- `[new]` Missing dataKey (typo) → dev warning, not silent zeros.
- `[new]` Duplicate x values (band); unsorted x (line) → dev warning.
- `[new]` Very large N (5k–50k) → GL path; document SVG thresholds.
- `[new]` Extreme values (1e9, 1e-9) → axis formatting (compactNumber) not overflowing.

---

## 10. Platform / runtime

- `[new]` SSR: render-to-string without DOM (Next.js/docsite) — guarded, no crash.
- `[?]` WebGL unavailable / `webglcontextlost` → GL marks fallback/message, no hard fail.
- `[?]` High-DPI (retina) — GL circles/lines crisp; SVG sharp.
- `[?]` Memory: streaming ring buffer bounded; canvas/ResizeObserver/rAF cleaned up on
  unmount (no leaks over long sessions).
- `[?]` `prefers-reduced-motion` honored (axis slide, any transitions).
- `[?]` Rapid re-render / prop churn — layout memoization stable (no thrash).

---

## 11. Accessibility (minimum target this stage)

- `[?]` Root SVG has role/title/desc; aria-label from title.
- `[new]` Per-series accessible labels (name + type).
- `[new]` Color is not the ONLY channel where it matters (consider patterns/labels).
- `[new]` (Follow-on) keyboard navigation of points/tooltip; data-table fallback.
- `[?]` Focus-visible styles for any interactive elements.

---

## 12. Theming / dark mode

- `[ok]` All 21 stories reviewed in dark mode; chrome + SVG marks adapt.
- `[?]` Non-neutral themes (stone, y2k) — chart colors + structural tokens resolve.
- `[?]` `theme="none"` (base tokens only) — no broken/missing token fallbacks.
- `[?]` Live theme/mode switch mid-session re-resolves everything (incl. GL).

---

## 13. Formatting / i18n

- `[ok]` `currency('$', locale)` on axis.
- `[?]` `percent`, `compactNumber`, `shortDate`, `monthYear` on axes + tooltip.
- `[?]` Locale-awareness (decimal/grouping separators, date locale).
- `[?]` RTL layout (axes, legend, tooltip placement).

---

## 14. API / type-level verifications

- `[new]` Export-surface test: barrel + package aliases export the full contract
  (option types, `ColorAccessor`/`Channel`, legend/margin/scale/`YBaseline` types).
- `[?]` No mark leaks internal-only fields; `SeriesDef` shape stable across all 12.
- `[?]` Channel type accepts constant | {field} | accessor uniformly (post-refactor).
- `[?]` `_uid` uniqueness across series (incl. dup dataKey, two streams, two ref lines).
- `[?]` Types encode x-scale requirements (or dev-warn) so wrong-scale pairings caught.
- `[?]` Tree-shaking: importing one mark doesn't pull all GL/d3 code.

---

## Current-state summary (from the screenshot pass — light + dark, all 21 stories)

Confirmed working: all bar variants, negative values, area/stacked area, WebGL scatter
(light+dark), heatmap coloring (light+dark), candlestick colors (light+dark), legend,
and dark-mode chrome/solid marks generally.
Confirmed bugs: line/area/dot edge clipping + overshoot; streaming blank; candlestick
axis-label smear (light+dark); financial-composite shared-scale; reference-label clip;
`legend="end"` clip; duplicate-key warning; broken default color tokens; heatmap
top-row clip + own scale; **translucent fills (band/area) wash out on dark**; Swatch
story under-demonstrates.
Design notes: heatmap ramp + candlestick colors are story-supplied hex, not theme
tokens (don't adapt to mode); y-axis is intentionally floating labels (confirm).
Largely untested: all hover/tooltip INTERACTION (screenshots are static), time/log
scales, SSR, WebGL context loss, runtime theme switching, non-neutral themes (stone/y2k),
RTL, a11y, formatters beyond currency, and all data edge cases.
