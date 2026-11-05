# ChartV2 Stage 1 — Design & Correctness Research

Deep design work for the "make it correct + a genuinely good API" stage. This is the
thinking behind Stage 1 of the plan (the package-extraction is a separate, mechanical
stage). Goal: decide what a great, hard-to-regret chart API looks like before we lock
it by publishing. Companion to `CHARTV2_PHASE1_PLAN.md` (findings/evidence) and the
plan panel (sequencing).

Status: research + proposals. Owner decisions needed in section 8.

---

## 0. TL;DR

- The core architecture — **marks are factory functions returning config; the chart
  owns one x/y scale; marks resolve() then render()** — is the modern, correct choice.
  It matches Observable Plot (the best-in-class "marks + shared scale" design) and the
  series-array model of MUI X / Plotly / Highcharts. We should keep it.
- The **API surface is inconsistent** in ~25 concrete ways (color has 5 shapes,
  `size` vs `radius`, `upper/lower` vs `high/low`, positional vs options-only, label
  only on 4 marks, GL marks can't take theme colors, etc.). This is where most of the
  design effort goes.
- The **single highest-leverage idea** is to adopt a **channel/encoding model** (a
  visual property can be a constant, a field name, or an accessor) uniformly across
  color/size/opacity. It collapses most inconsistencies into one coherent concept and
  fixes the accessor-color + legend problems as a side effect.
- The **color tokens are good** (10 categorical + 9 sequential ramps + neutral) and v1
  already has a strong palette API to adopt. Real gaps: auto-assignment, GL can't use
  tokens, categorical tokens are identical in light/dark, CVD-safety unverified.
- The biggest **correctness** gaps are scale-related: no time scale, no log scale,
  degenerate domains (single point / zero range / empty), and no honest baseline/clip
  (already in the plan). Plus a long failure-mode matrix (section 5).

---

## 1. Where ChartV2 sits in the charting-library landscape

There are four broad API families. Understanding them tells us which lessons to borrow.

- **Compositional / JSX children** — Recharts, Victory, visx.
  `<LineChart data><Line dataKey="x"/><XAxis/></LineChart>`. Discoverable and
  React-idiomatic, but scales are hard to coordinate, perf suffers with many nodes,
  and cross-mark consistency is manual. **This is exactly Chart v1's model** — and the
  reason v2 exists.
- **Per-chart-type config monolith** — Nivo, Chart.js, (partly) Tremor.
  `<ResponsiveLine data={...} big-prop-bag/>`. Fast for the common case; poor at mixing
  mark types (bar + line + band on one chart) and at composition.
- **Grammar of graphics / marks** — Observable Plot, Vega-Lite, AntV G2.
  `Plot.plot({marks:[Plot.barY(data,{x,y,fill}), Plot.lineY(...)]})`. Marks are
  functions/objects; the plot owns scales; every visual property is a **channel**.
  Best-in-class for correctness and composition; slightly higher concept count.
- **Series array config** — MUI X Charts, Plotly, Highcharts, ECharts.
  `series={[{type:'bar', data...}, {type:'line', ...}]}`, axes configured separately,
  multiple named axes for dual-scale. Pragmatic, very common in dashboards.

**ChartV2 is a hybrid of the best two:** Observable-Plot-style marks (`bar(...)`,
`line(...)` returning config) fed through a MUI-style `series={[...]}` array, with a
single shared scale. That is a strong, defensible foundation. Verdict: **keep the
architecture; fix the API surface and add the missing scale capabilities.**

What the best-in-class do that we currently don't:

1. **Uniform channels** (Plot/Vega-Lite): color/size/opacity accept constant | field |
   accessor everywhere. (We do this only for `bar`/`dot` color.)
2. **First-class, configurable scales** (all of MUI/ECharts/Plot): x/y (and color/size)
   scale _type_ and options are explicit and overridable. We infer linear-or-band from
   data and expose nothing.
3. **Time scale** (everyone). We have none — financial/streaming fake it with band
   strings or raw numbers. (`ScaleTime` is imported in the axis types but the root
   never builds one.)
4. **Multiple / secondary axes** (MUI/ECharts/Highcharts/Plotly/Chart.js) for dual-unit
   charts (price vs volume). We force one shared y — which is why the financial
   composite looks broken.
5. **CVD-safe default categorical palette** (Vega/Plot ship tableau10-like sets). Ours
   is close in spirit; needs verification.
6. (Out of scope, noting for completeness) **faceting / small multiples**.

---

## 2. The encoding / channel model (the biggest single API decision)

### The problem, concretely

From the API audit, "how do I set a visual property" is spelled many ways:

- color: `ColorAccessor` (bar/dot) | `string` (line/area/band/errorBar/referenceLine)
  | required `string` (dotGL/dotGLInteractive/streamGL) | `string[]` ramp (heatmapGL)
  | `upColor/downColor` pair (candlestick). Five shapes.
- "size of a point": `radius` (dot, a radius) vs `size` (dotGL, a diameter).
- opacity: `opacity` (most) vs `bandOpacity` (referenceLine) vs none (line/candlestick).

### The proposal: one `Channel<T>` concept

Borrow Observable Plot's channels. A visual property accepts one of three things:

```ts
type Channel<T> =
  | T // constant: color: '#0171E3' or a token
  | {field: string} // read a data column (maps via a scale)
  | ((datum: Row, index: number) => T); // accessor
```

Apply it uniformly to the properties that vary per-datum or per-series: `color`
(fill/stroke), `size`/`r`, `opacity`. Then:

- `bar('rev', {color: '#...'})` still works (constant).
- `bar('rev', {color: d => d.up ? green : red})` works (accessor) — and shows in the
  legend (section 3).
- `dot('y', {color: {field: 'category'}})` maps a column through the color scale
  (categorical) — the thing you actually want for scatter-by-category, which is
  currently impossible.

This single concept replaces C3/C8/C9/C14 from the audit and unlocks
color-by-field (a common, currently-missing capability). It is additive: constants
(today's usage) keep working.

Scope note: we do NOT need the full Vega-Lite type system (quantitative/ordinal/
temporal). Channels + a small set of explicit scales (section 4) is the right amount
of power for this library.

---

## 3. Color system (deep dive)

### What we have (good foundation)

Tokens (`packages/core/src/theme/domainTokens/dataTokens.ts`):

- **10 categorical**: blue, orange, purple, green, pink, cyan, red, teal, brown,
  indigo. (Tableau10-like — distinct hues for distinct series.)
- **9 sequential ramps × 5 steps** (5=darkest → 1=lightest): blue, shamrock, orange,
  pink, purple, red, teal, yellow, gray. For ordered/quantitative (heatmaps, choropleth).
- **1 neutral** (labels, reference lines, empty states).

v1's palette API (`getChartColors`/`useChartColors`) already exposes: `categorical(n)`,
`sequential[hue](n)`, `diverging.positiveNegative/coldHot/custom`, `semantic`
(positive/negative/warning/neutral), `structural` (axis/grid/tick/label), `alpha()`.
This is a genuinely good API — **adopt it wholesale** into the charts package.

### The problems to fix

1. **Broken defaults.** Marks default to `--color-chart-1` / `--color-positive` /
   `--color-negative`, none of which exist → black/invisible. Fix by **auto-assigning
   the categorical palette by series index at the chart root** (mark default color =
   "auto"; the root fills unset colors via `categorical(n)`). Candlestick up/down and
   errorBar/referenceLine default to `semantic`/`structural` from the palette.
2. **GL marks can't use tokens.** `hexToGL` does `parseInt(hex,16)` — a CSS var or
   `rgb()` becomes `NaN` (silent mis-render), which is why GL color is required-hex.
   Fix: resolve any CSS color (token/var/named/rgb) to concrete RGB before GL upload —
   via the theme resolver (we already have `token(name)`) and/or a canvas
   `getComputedStyle` fallback. Then GL marks accept the same colors as SVG marks and
   can auto-assign from the palette too.
3. **Accessor colors vanish from the legend.** `deriveLegendItems` drops any series
   whose `color` isn't a static string. With channels, a series has a _resolved_
   representative color (the assigned categorical slot, or the accessor sampled at a
   stable point, or — for color-by-field — a small scale the legend can enumerate).
   Legend should show it.
4. **Dark mode.** The categorical tokens are identical in light and dark
   (`light-dark(#0171E3, #0171E3)`). They're mid-tones chosen to read on both, and our
   screenshot pass shows them working — but this is a deliberate design point to
   confirm, not an accident. The **sequential ramps** include very dark steps
   (`#02165E`) that will lose contrast on the dark body; heatmaps/areas using low ramp
   steps need checking in dark mode.
5. **CVD (color-blind) safety.** The 10 categorical are tableau10-like but not verified
   for deuteranopia/protanopia/tritanopia. Add a verification task; document a
   recommended max distinct series (~8) before hues get hard to distinguish.
6. **Too many series.** Decide behavior past 10 categorical: recycle with a pattern/
   opacity shift, or warn. (Plot warns; ECharts recycles.) Recommend: recycle + dev
   warning.

### Color scale (new, small)

Introduce an explicit **color scale** at the root for `color: {field}` usage:

- categorical field → `categorical(n)` by distinct value (ordinal color scale).
- quantitative field → a sequential ramp (choose hue).
- diverging → `diverging.*` around a midpoint.
  This is what makes color-by-field coherent and legendable.

---

## 4. Scales — the correctness foundation

### Current state

`computeLayout` builds **either** `scaleLinear` (numeric x) **or** `scaleBand` (else)
for x, and always `scaleLinear` for y with domain `[min,max].nice()` (+ zero-inclusion
only if a bar/area is present). No configuration is exposed. Consequences:

- Endpoints glue to edges; monotone curves overshoot outside the plot (no clip).
- Empty data → band branch → `NaN` positions → streaming renders nothing.
- No time scale; no log scale; no per-axis control.

### Proposal

1. **Domain/baseline parity** (already planned): `yBaseline: 'auto'|'zero'|'data'`,
   `yDomain`, `xDomain` — authoritative when provided (no `.nice()`), mirroring v1.
   Add a plot **clipPath** and small **headroom** for continuous-only charts.
2. **Degenerate-domain handling** (correctness): single point / zero range / all-equal
   → synthesize a sensible span (e.g., `v±1` or `[0, v*2]`) so the mark is visible and
   ticks are sane; empty + explicit domain → honor the domain (fixes streaming).
3. **Explicit scale config** (new, optional): allow the caller to set x/y scale _type_
   and options rather than pure inference:
   ```
   xScale={{type: 'time'}}   // or 'linear' | 'band' | 'log'
   yScale={{type: 'log', domain: [1, 1e6], nice: true}}
   ```
   Inference stays the default. This is how MUI/ECharts/Plot all work and it removes a
   class of "it guessed wrong" bugs.
4. **Time scale** (fills a real gap): `scaleTime` for Date x-values; the axis already
   references `ScaleTime`. Enables honest financial/streaming time axes and good tick
   formatting (via the ported `shortDate`/`monthYear`).
5. **Secondary y-axis** (resolves the financial-composite problem): allow a mark to
   target a secondary y-scale (e.g., `bar('volume', {axis: 'y2'})`) with its own
   domain, like MUI's `yAxisId` / Plotly's `y2`. This is the principled fix for
   price-vs-volume rather than crushing one series. Decision needed (section 8) —
   it's powerful but adds surface; could be deferred to a follow-on if we instead
   document "don't mix incompatible units on one axis."

Design tension to be explicit about: **one shared scale is the whole value prop**
(marks can't disagree). Secondary axes are the _sanctioned_ exception, opt-in and
explicit, not automatic — preserving the guarantee for the default case.

---

## 5. Everything that can go wrong (failure-mode matrix)

For each: what happens today → what should happen. Drives Stage 1 fixes + Stage 2 tests.

### Data pathologies

- **Empty `data=[]`** → band scale, NaN, blank (breaks streaming). → honor explicit
  domain; otherwise render an empty-state (axes + "no data").
- **Single datum** → zero-width/near-degenerate domain. → synthesize span; center the point.
- **All values equal / zero range** → flat domain, `nice()` may collapse ticks. → pad domain.
- **All zero / all negative** → baseline handling (bars grow wrong way?). → verified by
  new edge-case stories; `yBaseline` correctness.
- **One huge outlier** → everything else squashed. → document log scale option; outlier
  is legitimate but the story should show the log remedy.
- **NaN / null / undefined / non-numeric in a numeric column** → currently coerced to 0
  silently (misleading). → skip (gap in line/area path) vs 0; decide + document. Prefer
  gap for line/area, skip point for dot.
- **Missing dataKey** (typo) → silent 0/undefined everywhere. → dev warning.
- **Duplicate x values** (band) / **unsorted x** (line) → band de-dupes silently; line
  draws zig-zag. → dev warning for unsorted line x.
- **Very large N** (10k+ SVG nodes) → jank. → GL marks exist; document thresholds;
  (m4 downsampling is a tracked follow-on).

### Scale / rendering

- **Overshoot outside plot** (monotone/natural curves) → escapes into margins. → clipPath.
- **Axis label overflow / overlap** (many band categories; long labels; big numbers) →
  candlestick smear today. → width-aware auto-skip + rotation/truncation option.
- **Tooltip at viewport edges** → can clip. → flip/clamp (partly handled; verify).
- **Legend overflow** (many series) → wrap/scroll; `legend="end"` currently clips the plot.
- **Reference-line label off-canvas** → clamp badge within plot.

### Runtime / platform

- **SSR / no DOM** (Next.js) → ResizeObserver/canvas/`window` access. → guard; render
  nothing or a placeholder until mounted. (Docsite is Next.js — this matters.)
- **WebGL unavailable / context loss** → GL marks blank. → fallback message or SVG path;
  handle `webglcontextlost`.
- **Canvas / listener cleanup** (streaming rAF, ring buffer, ResizeObserver) → leaks. →
  audit teardown.
- **High-DPI** → blurriness. → DPR handling exists in webgl utils; verify across marks.
- **Theme switch at runtime** → colors must re-resolve (esp. GL, which caches hex). →
  re-upload on theme change.
- **Reduced motion** → axis has `animated`; honor `prefers-reduced-motion`.

### Accessibility

- **Screen readers** → SVG has title/desc on root only; series/points aren't described.
  → at least role/aria-label; consider a data-table fallback (Highcharts/visx pattern).
- **Keyboard** → no keyboard access to tooltip/points. → follow-on, but note it.
- **Contrast** → structural (axis/grid/label) and series colors vs both backgrounds.

### i18n / formatting

- **Number/date/locale** → formatters exist (`currency`/`percent`/`compactNumber`/
  `shortDate`/`monthYear`); ensure locale-aware and ported into the package.
- **RTL** → axis sides, legend order, tooltip placement.

---

## 6. Per-mark API consistency pass (proposed normalization)

Target: a predictable surface where the same concept has the same name/shape everywhere.
(Full current-state evidence in the audit; this is the proposed end-state.)

- **Data input:** every data-bound mark takes a positional primary key where it has an
  obvious "primary" (`bar/line/dot/area/dotGL/dotGLInteractive`); multi-field marks stay
  options-only (`band/candlestick/errorBar/heatmapGL`) but use **consistent field
  names**.
- **Bounds naming:** unify the interval concept. Pick one vocabulary for
  `band`/`errorBar` (they're twins): recommend `high`/`low` (matches candlestick/finance)
  or `upper`/`lower` — one, not both. `referenceLine` keeps `y`/`y2` (they're values,
  not fields) but document the distinction.
- **Color:** one `Channel<Color>` everywhere (section 2); default = auto palette;
  candlestick uses `{up, down}` as a documented special case (or `color:{up,down}`).
- **Size:** standardize on one meaning. Recommend `radius` (SVG semantics) everywhere
  points are round; if we keep GL `size` as diameter, document the 2× relationship or
  convert so `radius` means radius for both.
- **Stroke:** `strokeWidth` everywhere (retire `lineWidth` on streamGL); expose the
  currently-hardcoded strokes (area top line, candlestick wick, line-dots radius).
- **Opacity:** `opacity` everywhere (retire `bandOpacity`; referenceLine band uses
  `fillOpacity` or nested `band:{opacity}`).
- **Curve:** export one shared `CurveType`; expose `curve` on area (and band?) using it.
- **label:** every non-utility mark accepts `label` and sets `SeriesDef.label` so legend/
  tooltip are correct; referenceLine's `label` is the badge (document the difference).
- **key/identity:** semantic `key` + layout-assigned `_uid` (planned) so duplicate
  dataKeys and two streams/refs don't collide.
- **x-scale requirements in types:** encode band-vs-linear-vs-time requirements so the
  compiler catches "heatmap on a linear x" instead of a silent null (via typed mark
  variants or a runtime dev warning at minimum).
- **De-dupe:** share the `xPixel` helper (every mark reinvents the band/linear px math);
  share `ColorAccessor`/`Channel` types (currently duplicated in bar/dot, unexported).
- **Tooltip semantics:** fix value derivation (candlestick shows only `open`; streamGL
  yields `undefined`; GL scatter creates chrome-tooltip rows). Decide per-mark what a
  tooltip row means, or let marks declare their tooltip contribution.

---

## 7. What is genuinely good (keep, don't churn)

- The marks + one-shared-scale architecture; `resolve()`/`render()` split; "root has
  zero knowledge of mark types."
- The `series={[...]}` config ergonomics; `legend`/`tooltip` as boolean-or-config props.
- Composable chrome primitives (`ChartSwatch`, standalone `ChartLegend`, `ChartAxis`
  toggles for line/ticks/grid).
- The pointer-event model (single capture rect → subscribers; tooltip re-renders only
  on index change).
- v1's palette API design and the token set.
- WebGL marks for scale (scatter/heatmap/stream) — a real differentiator vs Recharts/Nivo.
- Dark mode already works across the SVG marks.

---

## 8. Design decisions — DECIDED (recommended defaults; vetoable)

These meaningfully change scope/shape. Owner is new to charting and delegated these to
the recommended, industry-standard calls; each is reversible and open to veto by the
owner or by Ruby Cheung in the Stage-4 design review. Ranked by leverage.

1. **Channel model — ADOPTED.** `color`/`size`/`opacity` accept
   `constant | {field} | accessor` uniformly across marks. It's the backbone that makes
   the API coherent and unlocks color-by-field. (Bigger refactor of mark options, worth it.)
2. **Secondary y-axis — DESIGN NOW, implement if time allows.** Provide an opt-in
   `axis:'y2'` for dual-unit charts (price/volume); it also informs heatmap categorical-y.
   If it slips, document "one scale — don't mix units" and defer implementation to a
   follow-on. The default stays one shared scale (the core guarantee).
3. **Scales — parity + time + degenerate now; log if cheap.** Do `yBaseline`/`yDomain`/
   `xDomain` parity + clip + headroom + degenerate-domain handling + a time scale +
   explicit scale config this stage. Add explicit `type:'log'` if inexpensive, else
   follow-on.
4. **Null/NaN policy — DECIDED: gap + skip + dev warning.** Line/area break the path at
   null/NaN (gap); point marks skip the point; emit a dev-only warning. No silent
   coerce-to-zero.
5. **Bounds vocabulary — DECIDED: `high`/`low`.** Use `high`/`low` for both `band` and
   `errorBar` (matches candlestick/finance). `referenceLine` keeps `y`/`y2` (values, not
   fields), documented.
6. **Beyond-10 series — DECIDED: recycle + dev warning.** Reuse the categorical palette
   past 10 series and warn in dev; recommend a practical max of ~8 distinct hues.
7. **A11y target — DECIDED: minimum now.** Root aria/title/desc + per-series labels this
   stage; keyboard nav and a data-table fallback are a tracked follow-on.

Additional call recorded here: 8. **CVD-safety — verify, don't redesign.** Keep the existing categorical tokens; add a
verification pass (deuter/protan/tritan) and document findings rather than inventing a
new palette this stage.

---

## 9. Testing implications (feeds Stage 2)

- **Unit**: scale/domain (auto, baseline modes, explicit, empty, single, zero-range,
  time), channel resolution (constant/field/accessor), palette resolver + token→hex,
  legend/tooltip derivation (incl. accessor + color-by-field), `_uid` uniqueness,
  formatters, each mark factory's `SeriesDef` shape.
- **Failure-mode fixtures**: one dataset per row in section 5, asserted to not throw and
  to produce sane output.
- **Export-surface test**: the barrel + package aliases export the full contract.
- **Visual**: Playwright screenshots of every story in light + dark (existing harness),
  including the new edge-case and channel/color-by-field stories.
- **SSR smoke**: render to string without a DOM (guards Next.js/docsite usage).

---

## Appendix — source references

- Tokens: `packages/core/src/theme/domainTokens/dataTokens.ts`
- Palette API (to adopt): `packages/lab/src/Chart/getChartColors.ts`, `useChartColors.ts`
- GL color (hex-only): `packages/lab/src/Chart/webgl.ts` `hexToGL`
- Shared x helper (underused): `packages/lab/src/Chart/utils.ts` `xPixel`
- Domain/baseline parity reference: `packages/lab/src/Chart/Chart.tsx`
- Full API audit + inconsistency list: this session's catalog (mirrored into
  `CHARTV2_PHASE1_PLAN.md` findings).
