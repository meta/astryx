---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-115
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-11
phase: accepted
owners: [cixzhang]
affects_architecture: []
affects_families: []
affects_contributing: []
affects_consumer_docs: [Chart, ChartTooltip, ChartAxis]
---

# Chart value format system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/charts/src/Chart.tsx",
    "packages/charts/src/ChartTooltip.tsx",
    "packages/charts/src/ChartAxis.tsx",
    "packages/charts/src/tooltip.ts",
    "packages/charts/src/types.ts",
    "packages/charts/src/formatters.ts",
    "packages/charts/src/marks/**"
  ]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A chart's values read the same way in its default tooltip and in its hidden
data table. A builder declares once how a series' values and the chart's x
values read, for example
`$152K` and `Mar 2025`. The tooltip that pointer users see and the hidden
data table that screen reader users hear both show that text. A revenue chart
does not announce `152300` while its tooltip says `$152K`, and a missing value
reads the same on both surfaces. Without a declared format, axis ticks, the
tooltip, and the table share one default text.

## Non-goals

- The text a custom `formatTick` returns. Value formats never derive from it,
  and it never derives from them (DEC-2); only the default tick text is shared
  (FR13).
- Header text in the hidden data table. `component:Chart` owns the x and
  series column headers.
- Words around a present value, such as a unit noun. These come from the
  catalog (`architecture:internationalization` INV1a); a format returns the
  value's own text.
- Locale-aware default text, such as grouped numbers or localized dates, for a
  present value that has no declared format. That default is outside this
  record and keeps FR9's output.
- The accessible name of the chart image, which uses series labels and never
  values.
- Value text for the WebGL marks (`dotGL`, `dotGLInteractive`, `heatmapGL`,
  `streamGL`), including the hover card that `dotGLInteractive` draws itself
  (DEC-7). FR14 covers their tooltip rows.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Public contract

```tsx
<Chart
  data={rows}
  xKey="month"
  formatXValue={monthYear}
  series={[
    bar('revenue', {label: 'Revenue', formatValue: currency('$')}),
    line('margin', {label: 'Margin', formatValue: percent}),
  ]}
  axes={<ChartAxis position="left" formatTick={compactNumber} />}
  tooltip
/>
```

## Requirements

- **FR1 — One format type.** `@astryxdesign/charts` exports
  `ChartValueFormat`, a function of `(value: unknown, locale: Locale,
calendar: CalendarSystem) => string | null | undefined`. A format returns the
  display text for one value, an empty value included, or `null` or
  `undefined` for the chart's default text (FR8). The built-in `compactNumber`,
  `percent`, `shortDate`, and `monthYear` formatters, and the function that
  `currency(symbol)` returns (FR11), are `ChartValueFormat` values without a
  wrapper. A format that ignores `locale` and `calendar`, such as a closure
  over the caller's own formatter, is also valid.
- **FR2 — A series declares how its values read.** The `bar`, `line`, `area`,
  `dot`, and `candlestick` builders accept an optional
  `formatValue: ChartValueFormat`. The resulting `SeriesDef` carries
  it as a read-only `formatValue`, and a custom series definition may set it
  the same way. The format applies to every data key the series reads, so the
  open, high, low, and close values of one candlestick read alike. Utility
  marks (`band`, `errorBar`, `referenceLine`) take no format, because neither
  the tooltip nor the data table shows them. The WebGL mark builders take no
  format (DEC-7); a WebGL series that reads a data key shows that value with
  FR8 and FR9.
- **FR3 — The chart declares how its x values read.** `Chart` accepts an
  optional `formatXValue: ChartValueFormat` for the value under `xKey`.
  `useChart()` exposes the same `formatXValue`, so a `ChartTooltip` composed as
  a chart child shows the same x text as the built-in tooltip.
- **FR4 — Chart supplies the provider's locale and calendar.** Each call
  receives the `InternationalizationProvider` locale and the calendar that
  provider resolves, or `gregory` when there is no provider calendar or the
  runtime cannot show it (`architecture:internationalization` INV8 and INV10).
  A provider locale or calendar change re-renders the formatted text (INV4).
  The server and the client produce the same text for the same provider
  values.
- **FR5 — The tooltip shows formatted values.** The default tooltip body shows
  the x text as its heading. It shows each row's value text, both as the
  single bare value and in labelled rows. Each `TooltipSeriesValue` row carries
  `formattedValue: string`, the text that the row shows, beside the raw
  `value`, and a custom
  `tooltip.render` receives these rows. The raw `xValue` and raw row values
  stay unchanged.
- **FR6 — The hidden data table shows formatted values.** Each row header
  shows the x text. Each cell shows the value text of the first primary
  series, in `series` order, that reads the cell's data key.
- **FR7 — Surfaces agree.** For one data row and one primary series, the
  tooltip row text and the data-table cell text are identical, for present and
  empty values alike. Two series that read the same data key with different
  formats are the one exception: the table column follows FR6, and each tooltip
  row follows its own series.
- **FR8 — Empty values and the default text.** An empty value is `null` or
  `undefined`; every other value, `NaN` and infinities included, is a present
  value. When the series declares `formatValue`, Chart calls it for an empty
  value too, so the caller chooses the text. The tooltip and the data table
  show the default text, the catalog message `@astryx.chart.noData` (English
  default: "No data") resolved through the translator for the provider
  locale, in two cases: the value is empty and the series declares no format,
  or any `formatValue` or `formatXValue` call returns `null` or `undefined`.
  A returned string, the empty string included, is shown as given. The x
  value follows the same rules with `formatXValue`.
- **FR9 — No format means unchanged text for present values.** A series
  without `formatValue` and a chart without `formatXValue` render
  `String(value)` for present values.
- **FR10 — Formatting is display only.** Formats never change scales, domains,
  layout, hover selection, colors, or the raw values that render callbacks
  receive. A format that throws propagates its error to the caller, as
  `ChartAxis` `formatTick` does. Its string output is rendered as text, never
  as markup.
- **FR11 — `currency()` uses the supplied locale.** The function that
  `currency(symbol, locale?)` returns takes the value and an optional
  call-time locale. A locale given to the factory wins. Without one, the
  call-time locale applies, so `currency('$')` as a series format follows the
  provider locale that Chart supplies (FR4). With neither,
  `architecture:internationalization` INV9 governs the result.
- **FR12 — Built-in formatters defer empty values to the chart.**
  `compactNumber`, `percent`, `shortDate`, `monthYear`, and the function that
  `currency()` returns return `undefined` for a `null` or `undefined` input,
  so the chart shows its default text (FR8). An empty value never reads `0`,
  `0%`, `$0`, `null`, or `undefined`. For a present value, each built-in
  returns a string with its existing output.

- **FR13 — One default text for ticks, tooltip, and table.** A `ChartAxis`
  without `formatTick` shows each continuous-scale tick value as
  `String(value)`, the same default that FR9 gives the tooltip and the data
  table. The three surfaces use one shared default, so they cannot drift
  apart. A band-scale tick keeps its category string. An explicit
  `formatTick` wins over the default (DEC-2). Compatibility: this is a
  default change, visible to every caller who sets no `formatTick` on a
  continuous axis. Digit grouping, the typographic minus, and d3's shared
  tick precision disappear: a year axis reads `2019`, not `2,019`, and a
  `0.0` tick reads `0`. The charts package is private, so the change is
  outside the published compatibility promise (`spec:AST-017` FR2).
- **FR14 — A series without a value key adds no value text.** A primary series
  that reads no data key, such as `heatmapGL` and `streamGL`, adds no tooltip
  row and no data-table column. FR8's default text never stands in for a value
  that the series does not read.
- **FR15 — Axis ticks take the same format type.** `ChartAxis` accepts an
  optional `formatTick: ChartValueFormat` for its tick text. It is called with
  the tick value and the locale and calendar that FR4 describes. A result of
  `null` or `undefined` shows the default tick text (FR13), and a returned
  string is shown as given, before `truncate` applies. Every value format,
  the built-in formatters included, works as a `formatTick` without a wrapper,
  and a function of `(value) => string` stays a valid `formatTick`.

### Platform support

- Supported feature/engine floor: the `Intl` and `Temporal` support that
  `architecture:internationalization` already requires.
- Unsupported behavior: a provider calendar that the runtime cannot show
  resolves to `gregory` (FR4).
- Browser evidence: not required. The outputs are text in the DOM, which the
  unit and accessibility tests in Verification read.

## Current-state impact

- `component:Chart` gains `formatXValue`, formats the hidden data table
  (FR6), and exposes `formatXValue` through `useChart()`.
- `component:ChartTooltip`'s default body formats its heading and rows, and
  `TooltipSeriesValue` gains `formattedValue` (FR5).
- The five primary SVG mark builders and `SeriesDef` gain `formatValue`
  (FR2).
  `ChartValueFormat` joins the package exports.
- `packages/core/locales/en.json` gains `@astryx.chart.noData` with a
  translator description (`architecture:internationalization` INV6).
- `component:ChartAxis` uses the shared default text for continuous ticks
  without `formatTick` (FR13) and takes `formatTick` (FR15); its record's FR3
  defers to both.
- FR8 gap: for an empty value, the default tooltip body reads `null` or
  `undefined`, and the hidden data table shows an empty cell.
- FR11 gap: the function that `currency()` returns ignores a call-time locale.
- FR12 gap: `compactNumber`, `percent`, and the `currency()` function read
  `null` as `0`, and `shortDate` and `monthYear` read it as `null`.
- FR13 gap: `ChartAxis` formats continuous ticks with the d3 default tick
  format, which groups digits (`2,019`) and uses a typographic minus
  (`−20,000`).
- FR14 gap: `heatmapGL` and `streamGL` each add a tooltip row that reads
  `undefined`.
- FR15 gap: `ChartAxis` names its tick format `tickFormat`, typed
  `(value: unknown) => string`, and passes it no locale or calendar.
- The `Chart`, `ChartTooltip`, and `ChartAxis` consumer docs and the formatter
  docs show the declaration once, with a mixed-unit example and an
  empty-value example.

## Verification

| Contract | Verification                                                                       | Representative states                                                                                                                                                                            | Mutation or failure expectation                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR2 | Type tests and mark builder unit tests                                             | each listed builder with and without `formatValue`; each built-in formatter and `currency('$')` assigned without a wrapper; a custom `SeriesDef`                                                 | a builder drops the option, a built-in formatter fails to type-check as a format, or a utility or WebGL mark accepts one                                                                                      |
| FR3, FR5 | `ChartTooltip` tests with expected strings from platform `Intl`                    | single and multiple series; mixed units; candlestick; custom `render`; a directly composed `ChartTooltip`                                                                                        | the heading or a row shows the raw value, `formattedValue` differs from the shown text, or a raw argument changes                                                                                             |
| FR4      | Provider tests and a server/client render pair                                     | no provider; `fr` locale; `persian` provider calendar; a calendar the runtime cannot show; a locale change                                                                                       | a format receives the host locale, a calendar other than the resolved one, stale text after a provider change, or server and client text that differ                                                          |
| FR6, FR7 | `Chart` accessibility tests that compare table cells with tooltip rows             | every row of a small mixed-unit chart with empty values; two series that share a data key; the 100-cell limit                                                                                    | a table cell differs from its tooltip row outside the shared-key exception, or a column uses a series other than the first that reads its key                                                                 |
| FR8, FR9 | Focused tests for both surfaces, with the expected phrase read from the catalog    | `null` and `undefined` with and without a format, for series and x values; formats that return `null`, `undefined`, and `''`; `fr` locale; `NaN` and `Infinity`; present values without a format | a format is skipped for an empty value, a nullish result or an unformatted empty value shows text other than the catalog phrase, `''` is replaced, or present unformatted output differs from `String(value)` |
| FR10     | Layout and pointer tests with a format that returns long text, and one that throws | formatted and unformatted renders of the same data; a throwing format                                                                                                                            | scales, hover selection, or render-callback arguments change; a thrown error is swallowed; markup in the output is parsed                                                                                     |
| FR11     | `currency()` unit tests with expected strings from platform `Intl`                 | factory locale only; call-time locale only; both, with different locales; a one-argument call with a factory locale                                                                              | a call-time locale beats the factory locale, a call-time locale is ignored, or a one-argument call with a factory locale changes output                                                                       |
| FR12     | Built-in formatter unit tests                                                      | `null` and `undefined` into each built-in and the `currency()` function; present values                                                                                                          | a built-in returns a string for an empty value, or its output for a present value changes                                                                                                                     |
| FR13     | `ChartAxis` tests; expected strings are `String(tick)` of the scale's d3 ticks     | a year domain (2019–2025), a large domain (0–1,500,000), a negative domain (−20,000–20,000), a small-decimal domain (0–0.7), a band axis, an explicit `formatTick`                               | a tick shows digit grouping, a typographic minus, or padded precision, differs from the tooltip text for the same value, a band label changes, or an explicit `formatTick` loses                              |
| FR14     | `ChartTooltip` and `Chart` accessibility tests                                     | a `heatmapGL` chart; a `streamGL` chart; each beside a `bar` series                                                                                                                              | the series without a value key adds a tooltip row or a table column, or a row reads the default text                                                                                                          |
| FR15     | `ChartAxis` tests and type tests, with expected strings from platform `Intl`       | `formatTick` set to each built-in and to a custom `(value) => string`; `fr` locale; a format that returns `null`; with `truncate`                                                                | a built-in fails to type-check or receives no locale, a nullish result shows text other than the default tick text, or `truncate` runs before the format                                                      |

## Decision log

### DEC-1 — A series owns how its values read; the chart owns how x reads

**Reference:** `spec:AST-115/DEC-1`
**Decider:** `cixzhang`, `2026-11-11`

A series definition already owns its label and its color. Its unit belongs
with them. Charts that show two units, such as revenue bars beside a margin
line, are common, and each series carries its own unit. The x value belongs to
the chart that owns `xKey`. The names match Core's current `formatValue`
vocabulary for value display text. The format receives the provider locale and
calendar, so the built-in formatters work without a locale lookup at the
callsite.

Rejected: one chart-level value format, because a mixed-unit chart then needs
a format that switches on the data key.

### DEC-2 — Value formats and tick formats are separate props with one type

**Reference:** `spec:AST-115/DEC-2`
**Decider:** `cixzhang`, `2026-11-11`

Tick labels and value text answer different questions. A tick often wants a
coarse label (`$150K`), and a tooltip or table cell wants the value (`$152,300`).
A chart can have no axes or two value axes, and `Chart` does not read formats
out of its `axes` slot, so the tooltip and the table never take their text
from an axis. One `ChartValueFormat` type serves `formatValue`,
`formatXValue`, and `formatTick` (FR1, FR15), so one built-in or custom format
moves between the series, the chart, and an axis without a wrapper.

Rejected: deriving the tooltip and table text from the axis format.

### DEC-3 — `currency()` falls back to the call-time locale

**Reference:** `spec:AST-115/DEC-3`
**Decider:** `cixzhang`, `2026-11-11`

`currency(symbol)` is the one built-in formatter that is a factory. Its
returned function uses the locale passed at call time when the factory got
none, so it works as a series format like the other built-ins (FR11).
Compatibility: a locale given to the factory still wins, so existing
axis calls of `currency('$', locale)` keep their output. A call
with no locale at all follows `architecture:internationalization` INV9, which
records its host default as a known conformance gap.

### DEC-4 — The caller formats empty values; otherwise one catalog phrase

**Reference:** `spec:AST-115/DEC-4`
**Decider:** `cixzhang`, `2026-11-11`

An empty value means different things in different products, such as "not
reported", "0", or "—". A series format receives it and chooses the text
(FR8). Without a format, both surfaces show one translated phrase, so a screen
reader user and a pointer user meet the same words for the same gap.

Rejected: hiding empty rows by default, because the hidden table cannot drop a
cell and the two surfaces must agree.

### DEC-5 — A nullish format result means the chart's default text

**Reference:** `spec:AST-115/DEC-5`
**Decider:** `cixzhang`, `2026-11-11`

A pure formatter has no translator, so it cannot return the localized "No
data" phrase. A format returns `null` or `undefined` to ask for it, and the
built-in formatters do so for every empty value (FR8, FR12). A missing value
then reads the same with a built-in format, with no format, and on both
surfaces. A caller who wants other text returns a string; the empty string
stays a deliberate blank.

Rejected: built-ins return the empty string, because a missing value would then
read differently with and without a built-in format.
Rejected: built-ins return `String(value)`, because the surfaces would show
`null` or `undefined` to people.

### DEC-6 — One default text for every value surface

**Reference:** `spec:AST-115/DEC-6`
**Decider:** `cixzhang`, `2026-11-11`

A person who reads `2019` in the tooltip reads `2019` on the axis, not
`2,019`. Without a declared format, ticks, tooltip rows, and table cells show
`String(value)` from one shared default (FR9, FR13). The d3 ticks are clean
decimals, so the raw default shows no floating-point noise. A very small value
reads in exponent form, such as `5e-7`, the same on every surface. An
explicit `formatTick` still gives short axis labels beside exact values
(DEC-2).

Rejected: locale-aware defaults, because they group years as `2,025`.

### DEC-7 — Value formats cover the SVG marks

**Reference:** `spec:AST-115/DEC-7`
**Decider:** `cixzhang`, `2026-11-11`

The WebGL marks draw on a canvas and show values differently from the SVG
marks: `dotGLInteractive` picks a point under the pointer and shows it in its
own hover card, a heatmap cell's value sets its color rather than a y
position, and a stream's values live outside the chart data. A format on them would govern text on
surfaces that no record defines, so they take no `formatValue`, and FR14 keeps
a series without a value key out of the tooltip and the table. A record that
defines the WebGL marks' value surfaces gives them the same `formatValue`
option and `ChartValueFormat` type, so every mark reads values one way.

Rejected: giving `dotGL` and `dotGLInteractive` a `formatValue` and showing it
in the `dotGLInteractive` hover card.

### DEC-8 — Format props are named `format<Thing>`

**Reference:** `spec:AST-115/DEC-8`
**Decider:** `cixzhang`, `2026-11-11`

A prop that turns a value into display text is named with the `format` verb
and the thing it formats: `formatValue`, `formatXValue`, and `formatTick`.
This follows the repository's `format*` verb for display text and Core's
`formatValue`, so one word order covers every format in the chart package.
Compatibility: the charts package is private, so the axis prop name is
outside the published compatibility promise (`spec:AST-017` FR2).

Rejected: keeping the axis prop as `tickFormat` beside `formatValue`, because
one format type would then have two word orders.

## Open questions

None.
