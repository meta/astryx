# ChartV2 — Phase 1 Plan (make it good, in place)

Living plan for getting `packages/lab/src/ChartV2/` production-ready **in place** — no
renames, no deleting Chart v1, no new package, no docsite. Guiding principle
(from the owner): **real, production-ready fixes; default to the proper fix
whenever it's obviously right.**

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## 0. How to run / review

```bash
pnpm -F @astryxdesign/build build      # prereq
pnpm -F @astryxdesign/core build       # prereq (lab typecheck needs core's dist)
pnpm storybook                         # http://localhost:6006  (Lab / ChartV2*)
pnpm -F @astryxdesign/lab typecheck    # ChartV2 currently typechecks clean
pnpm test                              # vitest (no ChartV2 tests exist yet)
```

**Visual review harness** (how we "look at every chart"): a Playwright script
screenshots every ChartV2 story in light + dark by hitting
`iframe.html?id=<storyId>&globals=colorMode:{light|dark}`. Story IDs come from
`http://localhost:6006/index.json`. Kept in `/tmp/chartv2-shots/`. This is the
review loop — re-run after each change and eyeball the diffs.

---

## 1. Confirmed findings (evidence)

### Scale / domain

- **Continuous marks (line/area/dot) glue to plot edges + overshoot escapes.**
  `computeLayout` sets y-domain to exactly `[min,max]` (`.nice()` adds no padding
  when bounds are already round). `Simple Line`: Jan(38)=min sits on the axis,
  Jun(52)=max at top, and the `monotone` curve overshoots _above_ the plot.
  There is **no clipPath** (v1 has `astryx-chart-plot`) so overshoot renders into
  the margin. Bars look fine only because they force `includeZero`.
  → `layout.ts:128-136`, no clip in `Chart.tsx:295-346`.
- **Empty data breaks scales → streaming renders nothing.** With `data=[]`,
  `isNumericX` is false (`xValues.length > 0` guard), so x falls into the **band**
  branch with an empty domain; y-domain becomes `[Infinity,-Infinity]`. `streamGL`
  then maps pushed points through `xScale(n)`/`yScale(n)` → `undefined`/`NaN` →
  blank. Verified blank after 5s. → `layout.ts:44-60,84-136`, `streamGL.tsx:146-152`.
  **streamGL cannot work without `xDomain`/`yDomain` on the root.**
- **Financial composite is misleading**: volume bars (500–1500) share the price
  y-axis (80–130) and crush the candlesticks/MA to a sliver. Inherent to one
  shared scale. Story needs rethinking (drop volume, or a documented secondary-axis
  pattern). → `ChartV2Advanced.stories.tsx:121-171`.

### Chrome / layout

- **Band axis draws every category → candlestick x-labels overlap** into a smear
  (30 "Day N" labels). Auto-skip only runs if caller passes `maxTicks`. Needs
  width-aware default skipping. → `ChartAxis.tsx:89-113`.
- **Reference-line label badges clip** at the right edge ("Acceptable"); text width
  is estimated (`label.length*5.5+8`) and can overrun. → `referenceLine.tsx:70-71,177`.
- **Mixed Marks with `legend="end"` clips** the last bar/label (chart area shrinks
  but plot width/label centering overflow). → `Chart.tsx:277-282`.
- **Heatmap top row clips** slightly at the plot top. → `heatmapGL.tsx:102-105`.

### Broken defaults / correctness

- **Every mark's default color token is undefined.** `--color-chart-1`
  (bar/line/dot/area/band) and `--color-positive`/`--color-negative`
  (candlestick) do **not** exist in `packages/core/src/theme`. Default-colored
  marks render black fills / invisible strokes. All current stories dodge this by
  passing explicit hex. → `bar.tsx:72`, `line.tsx:35`, `dot.tsx:22`, `area.tsx:37`,
  `band.tsx`, `candlestick.tsx:21-22`.
- **Duplicate-key collision.** Series identity = `dataKey` (`key: dataKey`). Two
  series on one dataKey collide in the `resolved` map (`layout.ts` `resolved.set(s.key,…)`)
  and in React keys (`Chart.tsx` `key={s.key}`), silently dropping data. Live React
  warning fires on `AreaGradient` (`area('revenue')` + `line('revenue')`).
  Also `area` builds `gradientId = area-grad-${dataKey}` → duplicate DOM ids.
  → `types.ts:52-54`, all mark factories, `layout.ts:219`, `Chart.tsx:310-316`.
- **streamGL hardcodes `key:'stream'`** → two streams collide. → `streamGL.tsx:228`.
- **Inconsistent color API.** `bar`/`dot` accept `ColorAccessor` (string | fn);
  `line`/`area`/`band`/etc. accept only `string`. Accessor-colored series also
  vanish from the legend: `deriveLegendItems` drops any series with `color == null`,
  and accessor series set `color: undefined`. → `bar.tsx:12-14,83`, `dot.tsx:11,30`,
  `line.tsx:26-27`, `area.tsx:26-27`, `legend.ts:18-32`.
- **`dot.dodge` is a stubbed TODO** (declared, never used). → `dot.tsx:17,48`.
- **`key={i}` array-index React keys** in mark render loops → reconciliation bugs
  on reorder/stream. → `bar.tsx:151`, `line.tsx:88`, `dot.tsx:58`,
  `candlestick.tsx:83`, `errorBar.tsx:67`.
- **No color palette API** (v1 has `useChartColors`/`getChartColors` with
  `categorical`/`sequential`/`diverging`/`semantic`/`structural`/`alpha`). v2
  ships none. → compare `Chart/useChartColors.ts`, `Chart/getChartColors.ts`.
- **heatmapGL builds its own y band scale** (breaks one-shared-scale). → `heatmapGL.tsx:102-105`.

### Works well (leave alone)

All bar variants, negative values, grouped/stacked, mixed, area + stacked area,
confidence bands, error bars + reference band, WebGL scatter, heatmap coloring,
legend, swatch, and **dark mode across the board**.

---

## 2. Locked decisions

1. **Palette API** → build the real thing (reuse v1's `getChartColors`/`useChartColors`
   from the same package; wire marks to consume it + fix the broken default token).
2. **heatmapGL scale** → real fix: teach the chart root a categorical y-scale so the
   heatmap shares it.
3. **`yBaseline`/`yDomain`/`xDomain`** → full v1 parity (required for streaming).
4. **Mark names** (`bar`/`line`/`dot`) → deferred to packaging (not a bug; on the
   "not now" list). No renames now.

---

## 3. Work items (ordered)

Ordered to build foundation first and keep each step independently verifiable via
the screenshot harness.

### W1 — Series identity (`_uid`) [ ]

- **Problem:** duplicate-key collision (#3) + `key={i}` (#7) + streamGL key (#5).
- **Approach:** add layout-assigned `_uid` (mutable field, mirrors `_isTopOfStack`)
  = `${index}:${key}`; use it as the true identity for the `resolved` map, the
  `Chart` render key, tooltip lookups (`resolved.get`, `resolvedKeys`), and hover-dot
  keys. `key` stays a semantic label. Replace every `key={i}` in mark render loops
  with a stable per-datum key (e.g. `${dataIndex}` is fine _within_ a series, but
  prefer the x-value; index-in-series is acceptable since series are `_uid`-scoped).
  Fix `area` `gradientId` to include `_uid`.
- **Files:** `types.ts`, `layout.ts`, `Chart.tsx`, `ChartTooltip.tsx`, `tooltip.ts`,
  `marks/{bar,line,dot,candlestick,errorBar,area}.tsx`.
- **Verify:** `AreaGradient` React warning gone; a new "two series, same dataKey"
  story renders both.

### W2 — Domain / baseline parity + clip + continuous headroom [ ]

- **Problem:** edge-gluing + overshoot + empty-data breakage (#2, streaming).
- **Approach:** add `yBaseline?: 'auto'|'zero'|'data'`, `yDomain?`, `xDomain?` to
  `ChartProps`; thread into `computeLayout` (mirror v1 `Chart/Chart.tsx:150-220`:
  explicit domains authoritative + no `.nice()`; `zero` symmetric; `auto` includes
  0). Precedence: `yDomain` > root `yBaseline` > per-mark `includeZero`. Add a
  `clipPath` (like v1 `astryx-chart-plot`) around the marks layer. Add small domain
  **headroom** for continuous-only charts (no bar/includeZero, no explicit domain)
  so line/area/dot endpoints aren't glued to edges. Handle empty-data: if `xDomain`
  given, honor it even when `data=[]` (so streaming has a real numeric scale);
  likewise `yDomain`.
- **Files:** `Chart.tsx`, `layout.ts`, `types.ts` (SeriesContext already carries scales).
- **Verify:** `Simple Line` no longer clips; streaming story (given `xDomain`/`yDomain`,
  or a rolling window) draws.

### W3 — Streaming works end-to-end [ ]

- Depends on W2. Update `StreamingLine` story to pass a domain / rolling window (v1
  "stable streaming window"). Confirm streamGL maps points and the axis slides.
- **Files:** `ChartV2Advanced.stories.tsx`, possibly `streamGL.tsx` (guard when scale
  isn't linear).

### W4 — Color: unified accessor + palette API + legend fix [ ]

- **Problem:** inconsistent color (#4), broken default token, accessor legend drop,
  no palette (#8).
- **Approach:**
  - Re-export v1 palette from ChartV2 (`useChartColors`, `getChartColors`, types) via
    `ChartV2/index.ts` + package `index.ts`.
  - Marks default `color` to `undefined` = "auto"; the **Chart root** resolves a
    categorical palette (`useChartColors().categorical(n)`) and assigns a color to
    each series lacking one, by index — store as `_resolvedColor` on the def (like
    `_uid`); marks read `self._resolvedColor ?? ownColor`. Fixes the broken token
    AND gives multi-series auto colors.
  - Widen `line`/`area` (and `band` where sensible) to accept `ColorAccessor` for
    parity with `bar`/`dot`. Share one `ColorAccessor` type (move to `types.ts`).
  - Legend: show accessor-colored series using a representative color (resolve the
    accessor at index 0, or the assigned palette color) instead of dropping them.
- **Files:** `ChartV2/index.ts`, package `index.ts`, `types.ts`, `Chart.tsx`,
  `legend.ts`, `marks/{bar,dot,line,area,band,candlestick}.tsx`.
- **Verify:** default-colored multi-series chart shows distinct colors; new
  accessor-colored story appears in legend; dark mode palette adapts.

### W5 — dot.dodge [ ]

- Implement real dodge (offset overlapping points at the same x by radius), or
  remove the option. Prefer implement (production-ready). → `dot.tsx`.

### W6 — heatmapGL shares the chart scale [ ]

- Add categorical y-scale support to the chart root so the heatmap reads the shared
  y-scale instead of building its own. Bigger core change; do after W1–W4 land.
- **Files:** `layout.ts`, `types.ts` (ChartScale/SeriesContext), `Chart.tsx`,
  `ChartAxis.tsx`/`ChartGrid.tsx` (categorical y), `marks/heatmapGL.tsx`.
- **Verify:** heatmap rows align to a shared left axis; no own `scaleBand`.

### W7 — Axis label auto-density [ ]

- Width-aware default label skipping for band axes (fix candlestick smear) without
  requiring `maxTicks`. → `ChartAxis.tsx:89-113`.

### W8 — Story-level fixes [ ]

- Reference-line label clipping (measure/clamp badge x). Mixed-marks `legend="end"`
  clipping. Financial composite rework (secondary-axis story or drop volume).
  Heatmap top-row clip.

### W9 — New stories (review targets from the brief) [ ]

- Plain SVG `dot` scatter (not WebGL).
- `dotGLInteractive` hover.
- `referenceLine` solo: single `y`; `y`+`y2` band; `x` line.
- Edge cases: empty data, single point, all zero, all negative, one huge outlier.
- Accessor-colored series (exercises the legend fix).
- Duplicate-dataKey series (exercises W1).
- Dark-mode coverage confirmed for each via the harness.

### W10 — Tests + final verification [ ]

- Add colocated vitest for: `layout` (domain/baseline/empty/stacking), `_uid`
  uniqueness, `legend` derivation (incl. accessor), `tooltip` derivation. Run
  `pnpm test`, `pnpm -F @astryxdesign/lab typecheck`, `lint`, and re-screenshot all
  forms light+dark.

---

## 4. To verify / open questions

- Confirm exact set of missing tokens and the right categorical token names to
  default to (palette resolves `--color-data-categorical-*`).
- Headroom amount for continuous charts (e.g. ~5%) — pick + document.
- heatmap categorical-y: does introducing a band y-scale disturb any existing
  numeric-y consumer? (Guard: only when a mark requests categorical y.)
- Should `yBaseline` default stay `'auto'`-equivalent given per-mark `includeZero`
  already exists? (Lean: root override wins; keep per-mark default.)

## 5. Out of scope (deferred)

Rename ChartV2 → Chart · delete Chart v1 · move to `packages/charts` · docsite
second-library support + README · publish + CI.
