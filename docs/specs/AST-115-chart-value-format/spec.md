---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-115
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-10
phase: accepted
owners: [cixzhang]
affects_architecture: []
affects_families: []
affects_contributing: []
affects_consumer_docs: [Chart, ChartTooltip]
---

# Chart value format system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/charts/src/Chart.tsx",
    "packages/charts/src/ChartTooltip.tsx",
    "packages/charts/src/tooltip.ts",
    "packages/charts/src/types.ts",
    "packages/charts/src/formatters.ts",
    "packages/charts/src/marks/**"
  ]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A chart's values read the same way wherever a person meets them. A builder
declares once how a series' values and the chart's x values read, for example
`$152K` and `Mar 2025`. The tooltip that pointer users see and the hidden
data table that screen reader users hear both show that text. A revenue chart
does not announce `152300` while its tooltip says `$152K`.

## Non-goals

- Axis tick labels. `ChartAxis` keeps its own `tickFormat`; DEC-2 explains
  why the two stay separate.
- Header text in the hidden data table. `component:Chart` owns the x and
  series column headers.
- Words around a value, such as a unit noun or a "no value" phrase. These come
  from the catalog (`architecture:internationalization` INV1a); a format
  returns the value's own text.
- Locale-aware defaults for charts that declare no format (OQ3).
- The accessible name of the chart image, which uses series labels and never
  values.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Public contract

```tsx
<Chart
  data={rows}
  xKey="month"
  formatXValue={monthYear}
  series={[
    bar('revenue', {
      label: 'Revenue',
      formatValue: (value, locale) => currency('$', locale)(value),
    }),
    line('margin', {label: 'Margin', formatValue: percent}),
  ]}
  tooltip
/>
```

## Requirements

- **FR1 — One format type.** `@astryxdesign/charts` exports
  `ChartValueFormat`, a function of `(value: unknown, locale: Locale,
calendar: CalendarSystem) => string`. A format returns the display text for
  one present value. The built-in `compactNumber`, `percent`, `shortDate`, and
  `monthYear` formatters are `ChartValueFormat` values without a wrapper. A
  format that ignores `locale` and `calendar`, such as a closure over the
  caller's own formatter, is also valid.
- **FR2 — A series declares how its values read.** The `bar`, `line`, `area`,
  `dot`, `candlestick`, `dotGL`, and `dotGLInteractive` builders accept an
  optional `formatValue: ChartValueFormat`. The resulting `SeriesDef` carries
  it as a read-only `formatValue`, and a custom series definition may set it
  the same way. The format applies to every data key the series reads, so the
  open, high, low, and close values of one candlestick read alike. Utility
  marks (`band`, `errorBar`, `referenceLine`) take no format, because neither
  the tooltip nor the data table shows them.
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
  `formatXValue(x)` as its heading. It shows each row's `formatValue(value)`,
  both as the single bare value and in labelled rows. Each
  `TooltipSeriesValue` row carries `formattedValue: string` beside the raw
  `value`, and a custom `tooltip.render` receives these rows. The raw
  `xValue` and raw row values stay unchanged.
- **FR6 — The hidden data table shows formatted values.** Each row header
  shows `formatXValue(x)`. Each cell shows the format of the first primary
  series, in `series` order, that reads the cell's data key. That is the same
  series that names the column.
- **FR7 — Surfaces agree.** For one data row and one primary series, the
  tooltip row text and the data-table cell text are identical. Two series that
  read the same data key with different formats are the one exception: the
  table column follows FR6, and each tooltip row follows its own series.
- **FR8 — Missing values read as empty text.** A `null` or `undefined` value
  is never passed to a format. It renders as empty text in the tooltip and in
  the data table, and its row `formattedValue` is the empty string. Every
  other value, `NaN` and infinities included, is passed to the format.
- **FR9 — No format means unchanged text.** A series without `formatValue` and
  a chart without `formatXValue` render `String(value)` for present values.
- **FR10 — Formatting is display only.** Formats never change scales, domains,
  layout, hover selection, colors, or the raw values that render callbacks
  receive. A format that throws propagates its error to the caller, as
  `ChartAxis` `tickFormat` does. Its string output is rendered as text, never
  as markup.

### Platform support

- Supported feature/engine floor: the `Intl` and `Temporal` support that
  `architecture:internationalization` already requires.
- Unsupported behavior: a provider calendar that the runtime cannot show
  resolves to `gregory` (FR4).
- Browser evidence: none beyond unit tests; the outputs are text in the DOM.
  A real screen reader pass over the hidden table confirms that the announced
  text equals the tooltip text.

## Current-state impact

- `component:Chart` gains `formatXValue`, formats the hidden data table
  (FR6), and exposes `formatXValue` through `useChart()`.
- `component:ChartTooltip`'s default body formats its heading and rows, and
  `TooltipSeriesValue` gains `formattedValue` (FR5).
- The seven primary mark builders and `SeriesDef` gain `formatValue` (FR2).
  `ChartValueFormat` joins the package exports.
- FR5 gap: the default tooltip body renders `String(value)` for every value,
  so a missing value reads `undefined`.
- FR6 gap: the hidden data table renders `String(value)` for every present
  value.
- The `Chart` and `ChartTooltip` consumer docs and the formatter docs show the
  declaration once, with a mixed-unit example.

## Verification

| Contract | Verification                                                                       | Representative states                                                                                                        | Mutation or failure expectation                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR2 | Type tests and mark builder unit tests                                             | each listed builder with and without `formatValue`; each built-in formatter assigned without a wrapper; a custom `SeriesDef` | a builder drops the option, a built-in formatter fails to type-check as a format, or a utility mark accepts one                                      |
| FR3, FR5 | `ChartTooltip` tests with expected strings from platform `Intl`                    | single and multiple series; mixed units; candlestick; custom `render`; a directly composed `ChartTooltip`                    | the heading or a row shows the raw value, `formattedValue` differs from the shown text, or a raw argument changes                                    |
| FR4      | Provider tests and a server/client render pair                                     | no provider; `fr` locale; `persian` provider calendar; a calendar the runtime cannot show; a locale change                   | a format receives the host locale, a calendar other than the resolved one, stale text after a provider change, or server and client text that differ |
| FR6, FR7 | `Chart` accessibility tests that compare table cells with tooltip rows             | every row of a small mixed-unit chart; two series that share a data key; the 100-cell limit                                  | a table cell differs from its tooltip row outside the shared-key exception, or a column uses a series other than the first that reads its key        |
| FR8, FR9 | Focused tests for both surfaces                                                    | `null`, `undefined`, `NaN`, and `Infinity` with a format; present values without a format                                    | a format receives a missing value, the tooltip shows `undefined`, or unformatted output differs from `String(value)`                                 |
| FR10     | Layout and pointer tests with a format that returns long text, and one that throws | formatted and unformatted renders of the same data; a throwing format                                                        | scales, hover selection, or render-callback arguments change; a thrown error is swallowed; markup in the output is parsed                            |

## Decision log

### DEC-1 — A series owns how its values read; the chart owns how x reads

**Reference:** `spec:AST-115/DEC-1`
**Decider:** pending

A series definition already owns its label and its color. Its unit belongs
with them. Charts that show two units, such as revenue bars beside a margin
line, are common, and each series carries its own unit. The x value belongs to
the chart that owns `xKey`. The names match Core's current `formatValue`
vocabulary for value display text. The format receives the provider locale and
calendar, so the built-in formatters work without a locale lookup at the
callsite.

Rejected: one chart-level value format, because a mixed-unit chart then needs
a format that switches on the data key.

### DEC-2 — Value formats and axis tick formats stay separate

**Reference:** `spec:AST-115/DEC-2`
**Decider:** pending

Tick labels and value text answer different questions. A tick often wants a
coarse label (`$150K`), and a tooltip or table cell wants the value (`$152,300`).
A chart can have no axes or two value axes. `Chart` also does not read
formats out of its `axes` slot. A builder who wants the same text on both
passes the same function to both.

Rejected: deriving the tooltip and table text from the axis `tickFormat`.

## Open questions

- **OQ1 — `currency()` and the supplied locale.** (`human-api`) The function
  that `currency(symbol)` returns ignores the locale that Chart supplies, so
  a callsite wraps it as `(value, locale) => currency('$', locale)(value)`.
  The options are:
  - its returned function also accepts a locale and uses it when the factory
    got none. This is additive: one-argument axis calls keep their output.
  - the factory stays as it is, and the docs show the wrapped form.

  The host-locale default of `currency()` remains the separate
  compatibility change recorded under `architecture:internationalization`
  INV9.

- **OQ2 — Wording for a missing value.** (`human-design`) Should a missing
  value read as a localized "no value" phrase on both surfaces instead of
  empty text (FR8)? A phrase is a catalog message.
- **OQ3 — Defaults without a format.** (`human-api`) Should a chart without a
  declared format apply locale-aware defaults, such as grouped numbers and
  localized dates, instead of `String(value)` (FR9)? That changes the output of
  every chart that declares no format.
