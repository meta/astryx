---
schema_version: 3
template_version: 7
kind: component
id: component:Calendar
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, theming]
verified_by:
  [
    packages/core/src/Calendar/Calendar.test.tsx,
    packages/core/src/hooks/useGridFocus.test.tsx,
    packages/core/src/Calendar/__tests__/Calendar.a11y.test.tsx,
    packages/core/src/Calendar/__tests__/Calendar.a11y.chromium.spec.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: [design:bidirectionality, design:reduced-motion]
architecture:
  [
    architecture:internationalization,
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:react-component-runtime,
  ]
contributing: []
system_specs: [spec:AST-020/FR15, spec:AST-085, spec:AST-102]
---

# Calendar component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. `Calendar` and `CalendarProps` are exported from `@astryxdesign/core/Calendar`; `mode` selects a single date or a range, with `value`/`defaultValue`/`onChange`, bounds, constraints, span limits, focus date, and display options.                                                    |
| Behavior                | One or two months render as day grids; a day is picked by pointer or keyboard; each month grid holds at most one roving Tab stop, which arrow, Home/End, and Page keys move, following the reading direction.                                                                                        |
| End-user impact         | A keyboard or screen-reader user meets a named month grid, moves through it by day, week, and month, and hears each day's name, selection, today marker, and disabled state.                                                                                                                         |
| Builder impact          | None.                                                                                                                                                                                                                                                                                                |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. The month buttons use native `disabled` at a bound and scale under reduced motion, day buttons hold a fixed size, day and week numbers use ASCII digits, and a key-moved Tab stop can go stale; all are listed under Current-state impact. |
| Review checks           | Reject a day grid without `role="grid"` or a name, two days in one month holding a Tab stop, an arrow key that stops following the reading direction, or a selection or today state carried only by colour.                                                                                          |
| Governing rules         | `architecture:public-component-api/INV1,INV5–INV8`; `architecture:component-theming-surface/INV3–INV7`; `spec:AST-020/FR15`; `spec:AST-085/FR1, FR4`; `spec:AST-102` FR4; `design:bidirectionality` DR6; `design:reduced-motion` DR1; `architecture:internationalization` INV8.                      |

This table is a review projection; the body below is authoritative.

## Intent

Calendar lets a person pick a date or a date range by looking at whole months. It
owns the month grid, its navigation, selection and range semantics, and the
keyboard model that moves through days; date fields compose it.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: `value` with `onChange` is controlled;
  `defaultValue` starts internal state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The month grid: its weekday column headers, week rows, day cells, outside days,
  week numbers, and variable row count.
- Month navigation, the focused day, and the keyboard model that moves it.
- Single and range selection semantics, bounds, constraints, and span limits.

**Does not own / non-goals**

- The text field, popover, and bottom sheet that present a Calendar — owned by
  DateInput and its siblings.
- Time of day — owned by DateTimeInput.
- `handleRef`, `onFocusDateChange`, the opening month inside the `min`/`max`
  window, `weekStartsOn`, and `numberOfMonths` clamping — shipped and covered
  by the consumer docs and tests, uncontracted here beyond FR1–FR7.

## Public concepts

| Concept     | Closed values or states                      | Meaning                                         | Availability by variant/orientation/state | Default                                                                                                         | Owner                | Stability | Invalid-value behavior       |
| ----------- | -------------------------------------------- | ----------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------- | --------- | ---------------------------- |
| `mode`      | `single`, `range`                            | Whether one date or a start–end pair is picked. | Always                                    | `single`                                                                                                        | `component:Calendar` | stable    | Type-rejected                |
| Focused day | one visible day                              | The day whose button holds the grid's Tab stop. | Always                                    | selected day (`single`) or today when it is in that month and enabled, else the month's first enabled day (AR1) | `component:Calendar` | stable    | Clamped to the visible range |
| Day state   | selected, in range, today, disabled, outside | What a day cell exposes and paints.             | Per cell                                  | none                                                                                                            | `component:Calendar` | stable    | Not applicable               |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Basis                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| FR1 | Each rendered month is one `role="grid"` named for its month and year, with a `columnheader` per weekday (and, with week numbers, a named `columnheader` above the `rowheader` column) and one `row` per week. Month and year labels and day names come from the provider locale. Day and week numbers MUST use the locale's digits (`architecture:internationalization` INV8). Implementation gap: they render as ASCII digits in every locale.                                                                                                                                                                                                                         | shipped source and focused tests; `architecture:internationalization` INV8                         |
| FR2 | At most one day button in each month's grid holds `tabIndex={0}`; every other day button in that grid is `-1`. Each day button is the shared `sm` element size (inside an `md`-sized cell) as a minimum that grows with a set text size (`spec:AST-102` FR4). Implementation gap: the day buttons hold a fixed size.                                                                                                                                                                                                                                                                                                                                                     | shipped `useGridFocus` behavior; `Calendar.test.tsx` single-Tab-stop assertion; `spec:AST-102` FR4 |
| FR3 | A disabled day (outside bounds or rejected by a constraint) stays in the grid, stays focusable with `aria-disabled` and no native `disabled`, never holds the grid's Tab stop, and cannot be picked. Implementation gap: once a key move (arrow, Home, End, or Page key) has placed the Tab stop, it stays on that day when every day of the month becomes disabled (for example a range span cap in a two-month view).                                                                                                                                                                                                                                                  | `spec:AST-085` FR1, FR2; shipped source and focused tests                                          |
| FR4 | In `range` mode the first pick starts the range and the second ends it, a second pick before the start swapping the two so the end never precedes the start; `minRangeSpan`/`maxRangeSpan` bound it. Escape, or picking the start day again when `minRangeSpan` is above 1, clears an in-progress range.                                                                                                                                                                                                                                                                                                                                                                 | shipped source and focused tests                                                                   |
| FR5 | Moving the focused day across a month boundary navigates the visible month so the focused day stays visible, in one month or two; a borrowed adjacent-month day is exposed `aria-disabled` and cannot be picked; arrow keys, Home and End skip it, and a page never lands on it.                                                                                                                                                                                                                                                                                                                                                                                         | shipped source and focused tests                                                                   |
| FR6 | The month header shows the month and year between Previous and Next month buttons (ghost, icon-only Buttons whose chevrons mirror under RTL), which carry `calendar-nav` with `data-nav` and `data-disabled`. A button whose direction would leave `min` or `max` MUST stay focusable with `aria-disabled`, change nothing, and keep focus (`spec:AST-085` FR1, FR4). Implementation gap: it is natively disabled, so a focused button that reaches the bound drops focus. The month buttons are `component:Button`s, so their press scale MUST NOT apply under reduced motion (`design:reduced-motion` DR1). Implementation gap: it still applies under reduced motion. | `spec:AST-085`; shipped source and focused tests; `design:reduced-motion` DR1                      |
| FR7 | When the visible month changes, by the month buttons, a Page key, an arrow across a month edge, or the handle, the new month (both months in a two-month view) is announced politely; the first render and a pick that leaves the month in place announce nothing. In `range` mode the first pick announces the start and prompts for an end, the second announces the completed range in chronological order, and picking the start again when `minRangeSpan` is above 1 announces the cleared start; Escape clears an in-progress range without an announcement. Every announcement uses the provider locale.                                                          | shipped source and focused tests                                                                   |

### Allowed variation

- **AV1 — Month layout.** Row count, outside days, and week numbers may vary by
  props without changing FR1–FR5.
- **AV2 — Internal state.** The focused-day and selection state may be stored in
  any private shape.

### Representative states

| State                  | Required invariant                                                                                                                                                                                                 | Allowed variation     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| single, nothing picked | Today holds its month's Tab stop when it is enabled, otherwise the month's first enabled day does; no day is selected.                                                                                             | Month shown.          |
| single, picked         | The selected day is exposed as selected and holds the Tab stop. Implementation gap: after a key move places the stop, a later pointer pick can leave it there, always when the picked day comes later in the grid. | Month shown.          |
| range, in progress     | The start is selected; hovered days preview the range.                                                                                                                                                             | Pointer position.     |
| two months             | Both grids are named; at most one Tab stop in each.                                                                                                                                                                | Which month is first. |
| bounded                | Days outside `min`/`max` are disabled.                                                                                                                                                                             | Which days.           |

### Transformation and precedence order

- **ORD1 — Pick.** Disabled check → mode-specific selection update → `onChange`.
- **ORD2 — Focus movement.** Key → reading-direction mapping → target day → month
  navigation if needed → focus.

### Performance and resources

- **PR1 — Render-owned grid.** Day cells render from props and state; focus
  movement reads the grid's cells on demand; day buttons share the press
  controller's window and document listeners; Calendar owns no observer.

## Accessibility contract

- **AR1 — The day grid adopts the APG Grid pattern** (`spec:AST-020/FR15`), as
  one composite control: each month is `role="grid"` with an accessible name,
  weekday `columnheader` cells, week `row`s, and day `gridcell`s that carry
  `aria-selected` when selected or in range and hold one `button` named by the
  full date plus its selection or range role (selected, range start, range end,
  or in range), which exposes `aria-current="date"` for today and `aria-disabled`
  when disabled; one day button holds the Tab stop — the selected day in
  `single` mode when it is in that month and enabled, else today when it is in
  that month and enabled, else the month's first enabled day; a month with no
  enabled day has no Tab stop. Implementation gap: once a key move (arrow, Home,
  End, or Page key) has placed the stop, a later pointer pick can leave it
  there (always when the picked day comes later in the grid), and when every
  day of that month becomes disabled it stays on a disabled day.
  ArrowLeft and ArrowRight move by a day following the reading direction
  (`design:bidirectionality` DR6),
  ArrowUp and ArrowDown by a week, Home and End to the first and last enabled day of the
  week, PageUp and PageDown by a month, and Enter or Space picks the focused day;
  an arrow skips a day disabled by a constraint and continues in the
  same direction, crossing the month edge when it must; an arrow or Page key whose target
  lies past `min` or `max` changes nothing and keeps focus where it is, and
  so does an arrow whose direction has no enabled day within a year; a page
  onto a day disabled by a constraint focuses that month's first enabled day
  instead, and changes nothing when that month has no enabled day.

## Design relationships

`design:bidirectionality` DR6 governs the arrow-key direction (AR1), and
`design:reduced-motion` governs the month buttons' press scale (FR6).

| Anatomy or state | Design requirement                                                     | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Calendar root    | Holds the header and the grid; carries the component's theming target. | Current source and public docs | Supporting     | FR1                |
| Month header     | Names the month and offers previous/next navigation.                   | Current source and public docs | Supporting     | FR1, FR5, FR6      |
| Day button       | The control a date is picked with; carries the day target.             | Current source and public docs | Prominent      | FR2, FR3, AR1      |
| Day grid         | Presents the weeks and days as a named grid.                           | Current source and public docs | Prominent      | FR1, FR2, AR1      |
| Selected day     | Marks the chosen day or range without relying on colour alone.         | Current source and public docs | Prominent      | FR4, AR1           |
| Today marker     | Marks today distinctly from selection.                                 | Current source and public docs | Supporting     | AR1                |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Calendar root": {"target": "calendar"},
  "Month header": {"target": "calendar-nav"},
  "Day grid": {
    "none": {
      "reason": "reachability-gap: No current public target reaches the grid element itself; `calendar` paints the root and `calendar-day` the day buttons."
    }
  },
  "Day button": {"target": "calendar-day"},
  "Selected day": {"inherits": "calendar-day"},
  "Today marker": {"inherits": "calendar-day"}
}
```

`calendar` is carried by the root element, `calendar-nav` by the previous and
next month buttons inside the Month header, and `calendar-day` by each day
button.

## Family and system relationships

- `spec:AST-020/FR15` decides which APG parts a component adopts; the day grid
  adopts the Grid pattern because it already acts as one composite control.
- `spec:AST-085` owns disabled focusability; days meet it and the month
  buttons do not (FR6).
- `component:Button` renders the month buttons.

## Verification map

| Contract        | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Representative states                                                                   | Mutation or failure expectation                                                                                                                                                                                                                               | Audit section                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR1–FR5         | `Calendar.test.tsx` structure ("renders a valid APG grid: one grid, header row of columnheaders inside it, week rows of gridcells", "with week numbers, the header row's corner cell is a named columnheader, so every row child is a grid cell"), selection ("handles reverse range selection (end before start)", "caps the range highlight next to a disabled mid-range day (#2715)", "Escape cancels range selection in progress", "clears the in-progress start when the anchor is clicked again"), bounds ("prev button is disabled when focusDate month contains min", "next button is disabled when focusDate month contains max"), and navigation ("navigates to next month", "calls onFocusDateChange when navigating") suites                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | single, range, two months, bounded                                                      | A missing header row, a reverse pick that does not swap, a range highlight that reaches a disabled day, or a Previous/Next button enabled past `min`/`max` fails. Evidence gap: no test asserts locale digits for day or week numbers.                        | `audit:Calendar/behavior`      |
| AR1             | `Calendar.test.tsx` ("has accessible grid structure", "sets aria-multiselectable on both grids in a two-month range view", "does not set aria-multiselectable in single mode", "announces the new month politely when clicking next", "displays day names") and `useGridFocus.test.tsx` ("ArrowDown moves the tab stop one row down", "flips ArrowLeft/ArrowRight under RTL"); `Calendar.test.tsx` "ArrowUp skips a disabled cell in the same column to the next enabled row (complex-2)" for the disabled-day skip; `Calendar.test.tsx` Page-key cases ("moves the focused day by a month with PageDown and PageUp, into the month now shown", "pages from a borrowed adjacent-month day onto the real day in the month already shown", "an arrow past max changes nothing and leaves no pending target behind", "a page into a month with no enabled day changes nothing and keeps focus", "a page onto a day disabled by a constraint moves the month and focuses its first enabled day", "a page whose target lies past max changes nothing and keeps focus", "in a two-month view a boundary blocks only out-of-range targets, not month movement", "in a two-month view PageDown from the second month moves both months and a later Next click selects no stale day"); borrowed-day cases ("skips borrowed adjacent-month days and crosses into their month instead", "in a two-month view an arrow from the first month lands on the real day, never a borrowed one", "an arrow toward a direction where every remaining day is disabled changes nothing", "an arrow resolves the next enabled day in its direction first: weekdays-only ArrowRight from Friday January 30 reaches Monday February 2", "an arrow whose next day in range does not exist changes nothing: max January 25, ArrowDown from January 21"); the single-Tab-stop assertion in the AST-085 range-cap case (FR2). `Calendar.test.tsx` selection-state accessible-name cases ("appends 'selected' to the selected day's button name in single mode", "marks range start, end, and in-range days in their accessible names"). Evidence gap: no Calendar-level test of Home, End, Enter, or Space; no test covers the Tab stop after a key move followed by a pointer pick or a fully disabled month | LTR and RTL; month boundary; selected, today, disabled days                             | A day loses its role, name or state, two days in one month hold a Tab stop, or an arrow, Home/End, Page or activation key stops moving or picking.                                                                                                            | `audit:Calendar/accessibility` |
| FR6             | `Calendar.test.tsx` navigation, bound, theming-target ("renders the astryx-calendar-nav target on both month-nav buttons", "reflects the disabled nav state as a data attribute at the range edges", "keeps the default nav rendering unchanged (still a ghost icon button)"), and RTL month-navigation cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Previous and Next; at `min` and `max`; `dir="rtl"`                                      | A button enabled past a bound, a missing `calendar-nav` target or state attribute, or a lost shared chevron wrapper fails. Evidence gap: no test asserts focus kept at a bound (the FR6 gap), the mirrored chevron pixels, or the press under reduced motion. | `audit:Calendar/behavior`      |
| FR7             | `Calendar.test.tsx` month-change announcement cases ("does not announce on initial render", "announces the new month politely when clicking next", "announces the next month when paging the grid with PageDown", "announces both months in a two-month view", "does not announce when selecting a date leaves the visible month unchanged") and range announcement cases ("announces the start pick and prompts for an end date", "announces the completed range in chronological order for a reverse pick")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Month buttons, Page keys, handle; single and two months; range start, complete, cleared | A missing, extra, or out-of-order announcement fails. Evidence gap: no test reaches the cleared-start announcement (the cleared-range case sets no `minRangeSpan`).                                                                                           | `audit:Calendar/accessibility` |
| FR2 (size)      | Evidence gap: no test asserts day-button size or text growth                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                       | —                                                                                                                                                                                                                                                             | `audit:Calendar/layout`        |
| AR1 (browser)   | `Calendar.a11y.test.tsx` and `Calendar.a11y.chromium.spec.ts` over the shared grid states                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Every representative state                                                              | A lost grid name, role, or start neighbourhood fails; browser-owned outcomes are reported.                                                                                                                                                                    | `audit:Calendar/accessibility` |
| ORD1, ORD2, PR1 | ORD1 and ORD2 are covered by the FR3–FR5 and AR1 rows. Evidence gap: no test asserts the absence of per-cell listeners                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                                                                                       | —                                                                                                                                                                                                                                                             | `audit:Calendar/behavior`      |

## Current-state impact

- **Day and week digits (FR1).** Day and week numbers render as ASCII digits
  in every locale, while month labels follow the locale, against
  `architecture:internationalization` INV8.
- **Stale Tab stop (FR3, AR1).** After a key move places the Tab stop, a later
  pointer pick can leave it there (always when the picked day comes later in
  the grid), and when every day of that month becomes disabled it stays on a
  disabled day, so Tab can land on an unselected or disabled day.
- **Month buttons under reduced motion (FR6).** The Previous and Next buttons
  scale on a press when the person prefers reduced motion, as `component:Button`
  FR15 records, against `design:reduced-motion` DR1.
- **Fixed day size (FR2).** Day buttons hold a fixed size instead of growing
  with a set text size, against `spec:AST-102` FR4.
- **Month buttons at a bound (FR6).** Previous and Next become natively
  disabled at `min` and `max`, so a keyboard user on the button that reaches the
  bound loses focus, against `spec:AST-085` FR1 and FR4.

## Decision log

No component-local decision. The Grid adoption follows `spec:AST-020/FR15`.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples (`Calendar.doc.mjs`),
the date-field composition records, or shared theming rules. It links to their
owners.
