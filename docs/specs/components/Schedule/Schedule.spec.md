---
schema_version: 3
template_version: 7
kind: component
id: component:Schedule
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-06
owners: [cixzhang]
review_triggers:
  [public-api, behavior, layout, scrolling, layering, accessibility]
verified_by:
  [
    packages/lab/src/Schedule/Schedule.test.tsx,
    packages/lab/src/Schedule/TimeGridView.test.tsx,
    packages/lab/src/Schedule/timeGridLayout.test.ts,
    packages/lab/src/Schedule/monthLayout.test.ts,
    packages/lab/src/Schedule/__tests__/ScheduleTimeGridGeometry.a11y.chromium.spec.ts,
    packages/lab/src/Schedule/__tests__/ScheduleTimeGridOverlap.a11y.chromium.spec.ts,
    packages/lab/src/Schedule/__tests__/ScheduleTimeGridInitialPosition.a11y.chromium.spec.ts,
    packages/lab/src/Schedule/__tests__/ScheduleEventPopover.a11y.chromium.spec.ts,
    packages/lab/src/Schedule/__tests__/ScheduleMonthOverflow.a11y.chromium.spec.ts,
    packages/lab/src/Schedule/__tests__/ScheduleMonthChip.a11y.chromium.spec.ts,
    packages/lab/src/Schedule/__tests__/ScheduleMonthEventPopover.a11y.chromium.spec.ts,
    packages/lab/src/Schedule/__tests__/ScheduleTimeGridLongSpan.a11y.chromium.spec.ts,
    apps/storybook/stories/Schedule.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:react-component-runtime,
    architecture:component-theming-surface,
  ]
contributing: []
system_specs: [spec:AST-002/DEC-1, spec:AST-025/DEC-1, spec:AST-027/DEC-1]
---

# Schedule component contract

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | One additive option on the week, day, and month view factories: `renderPopover?: (event: CalendarEvent) => ReactNode` on `createScheduleWeeklyView`, `createScheduleDayView`, and `createScheduleMonthlyView`. `Schedule` props, `ScheduleContextValue`, and the list view gain nothing; the month view's overflow control and day popover are view-owned and take no option.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Behavior                | In the week and day views one viewport owns both scroll axes; the day header, all-day row, and hour gutter are sticky items of the same grid as the day columns (FR1–FR3). A range that contains today opens once, one hour before now, and never moves the person's own scroll afterwards (FR4–FR6). Simultaneous events share the column side by side in a deterministic, isolated layout; nothing is covered or dropped (FR7–FR10). A timed event of 24 hours or more is a span in the all-day row, not blocks in the columns (FR21). With `renderPopover`, each painted event with content is a native button the view renders, and the view opens one popover it owns with that content; without it, the views stay read-only (FR11–FR14). In the month view a week row paints at most three levels of chips; a busy day trades its third level for a "+N more" button that opens the view's one popover listing the whole day, so no event is dropped or painted outside its row (FR15–FR17). Month chips lead with the title (FR18). With `renderPopover`, month chips are buttons in the cell where they start and open the month view's one popover, which a busy day's list hands an event to in the same gesture (FR19–FR20).                                                                                  |
| End-user impact         | Pointer users open an event's details from the event itself; keyboard users reach and scroll the grid, open an event with Enter or Space, read its details in a dialog, and return to the event on Escape; screen-reader users get named event buttons in day groups that announce their popup, expanded state, and controlled dialog; people with classic scrollbars or narrow windows see one aligned header, gutter, and body; a week opened in the afternoon shows the afternoon; a meeting that lasts days reads as one span across them instead of filling and narrowing their columns; a busy month day shows how many events it hides and lists them all on press, and month chips name the event before its time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Builder impact          | Optional: build the week, day, or month view with `renderPopover` and return the details content for an event. No migration; read-only callers change nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Compatibility/readiness | Additive within the experimental `@astryxdesign/lab` surface. Read-only markup is preserved apart from the keyboard-reachable viewport that `spec:AST-025` already requires, the month view's table structure, and its "+N more" button on a busy day.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Review checks           | Reject an activation prop or callback on `Schedule` or in the context value, trigger props or open state exposed to the caller, a Popover prop passed through the view option (padding, placement, width, controlled state, dismissal), a close or controls argument to `renderPopover`, a popover instance per event, a button that opens nothing, a render prop that replaces the event's painted content, a rank/priority/`isShared` field, an `initialScroll` prop, a second scroll container inside the time grid, JavaScript scrollbar-width constants, inter-block `z-index` or any page-level stacking band, focusable nodes inside the hidden read-only grid, a scroll that re-runs on data refresh or theme change, a timed event of 24 hours or more painted as blocks in the day columns, a month chip painted outside its week row, a month event neither painted nor counted, a month week row that grows, a "+N more" that is not a native button or opens nothing, a second month popover, a month `grid` role, `aria-readonly`, or arrow-key promise, a month chip whose time precedes or truncates its title, a month event button outside its start cell or a second accessible copy of a month event, a nested popover for an event chosen from a day's list, and a caller option for month overflow. |
| Governing rules         | `spec:AST-002` FR1–FR4, FR10 (admission and independently correct states); `spec:AST-025` FR2, FR12, FR14, FR15, FR18 (one explicit owner, keyboard access, chaining, native scrollbars, deterministic nesting); `spec:AST-027` FR1–FR6 (local stacking inside an isolation owner); `component:Popover` (the dialog surface, its padding, dismissal, and focus behaviour).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

This table is a review projection; the body below is authoritative.

## Intent

Schedule renders events from a caller-owned source as a month grid, a week or
day time grid, or a list, for the range around a controlled date. It owns
timezone-aware date math, range paging through header plugins, async loading
with a suspended fallback, and the layout of events inside each view. The time
grid is the view where geometry carries meaning: an event's vertical extent is
its duration, its horizontal share of a day column is how many things happen
at once, and the viewport's scroll position is which part of the day a person
is looking at. This record settles those three geometric contracts and the
one interaction the time-grid views offer on events: a popover the view owns,
with content the caller supplies. The month view gives every week row one
height; the record settles how a busy day fits into it without losing an
event, and the month view offers the same event popover as the time grid.
Interaction is a property of a view, not of Schedule.

## Compatibility and migration

- Released default preserved: not yet released as stable; the component ships
  in the experimental `@astryxdesign/lab` package.
- Compatibility class: additive. The time-grid view option `renderPopover`
  is optional and absent by default. The time grid's default behaviour changes
  in four ways that no caller can observe through API: initial scroll
  position when the range contains today, side-by-side placement of
  simultaneous events, one scroll owner with sticky header, all-day row,
  and gutter, and timed events of 24 hours or more as spans in the all-day
  row. The month view's default changes in three ways: its accessible
  structure is a table rather than a read-only grid, a day with more
  events than three levels shows two chips and a "+N more" button, and a
  chip shows its title before its time.
- Controlled/uncontrolled behavior: unchanged. `date` stays fully controlled
  through `onChangeDate`; Schedule holds no selection state.
- Migration decision: none required (DEC-1 through DEC-6 are additive or
  internal).

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Resolving the rendered range from `view` and `date`, filtering and sorting
  the event source to that range, and suspending while a loader is pending.
- The time-grid geometry: the single scroll viewport, sticky header, all-day
  row and hour gutter, hour slots, the now-line, and the placement of timed and
  all-day events inside their day columns, including how simultaneous events
  share a column and which timed events are spans in the all-day row.
- The initial scroll position of the time-grid viewport for each rendered
  range, and remembering a person's scroll offset for that range across the
  suspended fallback and the loaded content.
- The event popover in the week and day views: when the view is built with
  `renderPopover`, each painted event block with content is a native button
  the view renders — its position, paint, content, accessible name, DOM order,
  local focus raise, and popup attributes — and the view owns the one Popover
  those buttons open: its instance, which event is open, its anchor, its
  dialog name, its standard surface and padding, and when it closes.
- The hidden read-only grid that announces the time grid's structure to
  assistive technology when the view has no `renderPopover`.
- The month view's table structure and event layout: its headers and cell
  names, chip levels in each week row, the cap of three levels, the "+N more"
  count on a busy day, and the one popover that shows a busy day's events or,
  with `renderPopover`, one event's content — its instance, what is open, its
  anchor, its dialog name, its standard surface and padding, and when it
  closes.

**Does not own / non-goals**

- The popover's content: what an event's details say, their loading and
  errors, and any actions or links inside them — owned by the product callsite
  through `renderPopover`. The callsite never receives trigger props, open
  state, or the popover instance.
- Any interaction other than the event popover of the week, day, and month
  views and the month view's day popover — navigation, menus, editing,
  selection, drag — not Schedule concepts in this record.
- Event interaction in the list view and in custom views — each view owns its
  own interaction contract; Schedule and its context carry no activation
  callback for any view.
- Dialog semantics, dismissal, focus movement, and surface padding of the
  popovers themselves — owned by `component:Popover`; the time grid and the
  month view compose that component with its defaults and expose none of its
  props.
- Event creation, moving, resizing, or drag — not Schedule concepts.
- A ranking or priority between simultaneous events; no event is preferred
  over another in layout.
- The paging controls and view switcher — owned by the header plugins.
- Cross-surface stacking of anything that floats above the page — owned by
  `architecture:layer-runtime`; Schedule paints nothing in the top layer.
- Keyboard scrolling mechanics, scroll chaining, and native scrollbar
  presentation — owned by `spec:AST-025`; Schedule participates through the
  shared scroll hook.

## Public concepts

Consumer prop syntax and examples remain in `Schedule.doc.mjs`.

| Concept          | Closed values or states                                                                       | Meaning                                                                                                                                                          | Availability by variant/orientation/state                                                                                                      | Default                                      | Owner                | Stability        | Invalid-value behavior                                              |
| ---------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------------------------- |
| view             | month, week, day, list, or a caller-built view object                                         | which layout renders the range and how the range expands around `date`                                                                                           | always                                                                                                                                         | required                                     | `component:Schedule` | experimental Lab | type-level only                                                     |
| event source     | static array, async loader                                                                    | where events for the rendered range come from; a loader suspends until it resolves                                                                               | always                                                                                                                                         | required                                     | `component:Schedule` | experimental Lab | type-level only                                                     |
| categories       | label and one of ten colors                                                                   | how an event's `category` string resolves to a color and an announced name                                                                                       | always                                                                                                                                         | `[]`; unmatched names render blue            | `component:Schedule` | experimental Lab | an unknown color is a type error                                    |
| focus date       | any instant                                                                                   | the day treated as today for highlighting; it does not drive the initial scroll, which follows the clock                                                         | month, week, day                                                                                                                               | now at mount                                 | `component:Schedule` | experimental Lab | n/a                                                                 |
| hour window      | `minHour` 0–23, `maxHour` 1–24, `hourHeight` pixels                                           | which hours the time grid draws and how tall one hour is                                                                                                         | week, day                                                                                                                                      | 0, 24, 100                                   | `component:Schedule` | experimental Lab | out-of-range hours are clamped; `maxHour` is forced above `minHour` |
| event popover    | view option present with content, present with `null` for an event, absent                    | whether the week, day, and month views open a view-owned popover from an event, with the content the caller returns for that event, or paint the event read-only | week and day event blocks, timed and all-day; month chips and the rows of a day's list; the list view has no interaction option in this record | absent                                       | `component:Schedule` | experimental Lab | `null` or `undefined` content leaves that event read-only           |
| initial position | today in range, today not in range                                                            | where the time-grid viewport opens for a rendered range                                                                                                          | week, day                                                                                                                                      | one hour before now, or the window start     | `component:Schedule` | experimental Lab | derived; not caller-settable                                        |
| overlap column   | one column per concurrently painted event inside an overlap cluster                           | how simultaneous events share a day column                                                                                                                       | week, day timed events                                                                                                                         | equal columns, expanded into free neighbours | `component:Schedule` | experimental Lab | derived; not caller-settable                                        |
| month levels     | up to three levels of chips per week row; a day that needs more shows two chips and "+N more" | how many chips a month week row paints and what stands in for the rest                                                                                           | month                                                                                                                                          | three levels                                 | `component:Schedule` | experimental Lab | derived; not caller-settable                                        |
| day popover      | closed, open for one day                                                                      | the view-owned popover that lists every event of one busy month day                                                                                              | month days with "+N more"                                                                                                                      | closed                                       | `component:Schedule` | experimental Lab | derived; not caller-settable                                        |

## Behavioral and layout contract

Each requirement names its basis so observed code is not mistaken for an
intentional decision.

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Basis                                                                | Review state |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------ |
| FR1  | The time grid MUST have exactly one scroll container, which owns both the block and inline axes. The day header cells, the all-day row, the hour gutter, the corner, and the day columns MUST be items of one CSS grid inside that container, so header and body columns share tracks by construction. No descendant MUST establish a second scroll container on either axis.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | DEC-4; `spec:AST-025` FR2, FR18                                      | settled      |
| FR2  | The header cells and the all-day row MUST stay pinned to the block-start edge of the viewport while it scrolls; the hour gutter and the corner MUST stay pinned to the inline-start edge. Pinning uses `position: sticky` with logical insets, so it mirrors under right-to-left direction without direction-specific code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | DEC-4                                                                | settled      |
| FR3  | Under any scrollbar presentation (overlay, classic, forced-visible), at any viewport width and zoom, and in either direction, each header cell's inline-start and inline-end edges MUST lie within 1 CSS pixel of its day column's edges, including after the viewport is scrolled on the inline axis. The viewport reserves its block-axis scrollbar space with `scrollbar-gutter: stable`. The time grid MUST NOT read or hard-code scrollbar dimensions in script, and MUST NOT widen the page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | DEC-4; `spec:AST-025` FR15                                           | settled      |
| FR4  | When a rendered range's days include today in the schedule's timezone, the viewport MUST open with its scroll offset at the now-line's offset within the day column minus one `hourHeight`, clamped to `[0, scrollHeight − clientHeight]`. When the range does not include today, it MUST open at offset 0, the configured `minHour`. Positioning is instant, never animated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | DEC-3                                                                | settled      |
| FR5  | FR4 runs once per range key — the range's start and end instants, the timezone, and the hour window (`minHour`, `maxHour`, `hourHeight`), never an object identity — on that key's first layout. Event data arriving or refreshing, clock ticks, resizes, theme or direction changes, re-renders, and a caller rebuilding its view object MUST NOT move the viewport. Paging to another range or switching to a view with a different range or hour window is a new key and positions again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | DEC-3                                                                | settled      |
| FR6  | The viewport's scroll offset for the current range key MUST survive the suspended fallback being replaced by loaded content: when the content viewport mounts for a key whose offset was already recorded, it restores that offset instead of running FR4. The memory lives above the suspense boundary, is keyed by FR5's range key, and holds at most the current key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | DEC-3; `architecture:react-component-runtime` resource lifetime rule | settled      |
| FR7  | Timed events in one day column are grouped into overlap clusters: two events are in the same cluster when their visible minutes intersect, directly or through a chain of intersecting events. Events are ordered by visible start ascending, visible end descending, then `id` ascending; each takes the first column in its cluster whose last occupant ends at or before its start. The result MUST be identical for any input order of the same events.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | DEC-2                                                                | settled      |
| FR8  | Every event in a cluster MUST be laid out side by side: its inline-start offset is its column index over the cluster's column count, and its inline size spans its own column plus every following column that no later-starting event of the cluster occupies during its minutes. Two painted blocks in one day column MUST NOT overlap by more than 1 CSS pixel on the inline axis, no block MUST be fully covered, and no event MUST be dropped. A block's minimum visible duration remains fifteen minutes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | DEC-2                                                                | settled      |
| FR9  | Blocks carry no `z-index` relative to one another. The day column, the all-day surface, and the time-grid viewport are `isolation: isolate` owners; the now-line, a focused block, and a hovered block may rise with a local positive `z-index` inside their column only. No Schedule value participates in page-level stacking.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `spec:AST-027` FR1–FR6                                               | settled      |
| FR10 | Narrow columns stay legible by subtraction, not by hiding events: the title keeps a single ellipsized line, and the time line is hidden through a container query when the block is narrower than the time label needs. Nothing about an event's position depends on its text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | DEC-2                                                                | settled      |
| FR11 | When a week or day view is built with `renderPopover`, the view calls it during render for each painted event block — timed blocks and all-day pills — with the caller's `CalendarEvent`. A block whose content is not `null` or `undefined` is a native `<button type="button">` the view renders: its grid position and paint, its content, its accessible name (AR2), and its popup attributes `aria-haspopup="dialog"`, `aria-expanded`, and `aria-controls` (AR3). Click, tap, Enter, and Space toggle that event's popover. A block whose content is `null` or `undefined` is painted as in the read-only view and exposed as static text inside its day group; it is never a button. A timed event shorter than 24 hours that crosses midnight paints one block, and so one button, per day; a timed event of 24 hours or more is one all-day span per range (FR21). The DOM order of event buttons is all-day segments in range order, then each day column's timed events in FR7 order, independent of their painted column. The buttons are the time grid's accessible representation in this mode: the hidden read-only grid is not rendered beside them. | DEC-1; `spec:AST-002` FR1–FR4                                        | settled      |
| FR12 | The time grid owns exactly one popover instance, rendered through `component:Popover` with that component's defaults — dialog role, modal, auto-focus, hidden fallback close, Escape dismiss, light dismiss, standard surface and padding — and named by the open event's `title`. At most one event is open at a time; opening another event closes the first and opens the second in the same gesture. The popover closes when it is dismissed, when its event is no longer painted (removed from the source, paged out of range, or the view is swapped), and its `aria-expanded` reflects the open event and no other. The content is `renderPopover(event)` for the open event only; it re-renders with the event object for the same `id` while that event stays in range.                                                                                                                                                                                                                                                                                                                                                                                     | DEC-1; DEC-5; `component:Popover`                                    | settled      |
| FR13 | Without `renderPopover`, event blocks remain non-interactive, painted decoration, and the hidden read-only grid remains the only accessible representation of events in the time grid. The only focusable element inside the time grid is the scroll viewport, and only while it overflows (AR1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | DEC-1; `spec:AST-002` FR10                                           | settled      |
| FR14 | `renderPopover` is an option of the week, day, and month view factories and of no other view; the week and day views share the time-grid event anatomy, and the month view applies the same option to its chips (FR19–FR20). The list view renders events read-only and exposes no interaction option in this record; a future interaction contract for it is its own record change and may differ. `Schedule` and `ScheduleContextValue` carry no activation callback. The option exposes no trigger props, open state, popover instance, or Popover presentation props, and takes no close or controls argument; each view presents the popover as a popover at every pointer type and width.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | DEC-1; DEC-5                                                         | settled      |
| FR15 | The month view paints each event as one chip per week it covers, spanning its days in that week. Chips in a week row take levels: events are ordered by first day ascending, then all-day and multi-day events before single-day timed events, then events covering more days first, then earlier start, then title, then `id`, so a busy day keeps its earliest events; in each week it covers, an event takes the lowest level that is free on every day it covers there. The result MUST be identical for any input order of the same events. A week row paints at most three levels, keeps its height, and MUST NOT paint a chip outside its row. The month surface is an `isolation: isolate` owner; chips and a focused "+N more" rise with a local positive `z-index` inside it only.                                                                                                                                                                                                                                                                                                                                                                         | DEC-6; `spec:AST-027` FR1–FR6                                        | settled      |
| FR16 | Every event of a day MUST be either painted as a chip on that day or counted by that day's "+N more"; no event is dropped. When any event covering a day sits at level four or higher, that day's third level holds "+N more" instead of a chip, and N is the number of that day's events at level three or higher. A chip whose span crosses such a day is painted on its other days and counted on that one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | DEC-6                                                                | settled      |
| FR17 | "+N more" is a native `<button type="button">` inside its day's cell. Click, tap, Enter, and Space toggle the month view's one popover for that day, rendered through `component:Popover` with that component's defaults and named by the day's full date. The popover lists every event of that day in start order, each with its time range or "All day" and its title, marked with its category colour and muted once past; those events are read-only. At most one day is open at a time; activating another day's "+N more" closes the first and opens the second in the same gesture. The popover closes when it is dismissed and when its "+N more" is no longer rendered — the day no longer needs more than three levels, the range is paged, or the view is swapped — and `aria-expanded` reflects the open day and no other.                                                                                                                                                                                                                                                                                                                              | DEC-6; `component:Popover`                                           | settled      |
| FR18 | A month chip shows the event's title first. A timed event's start time follows the title on the same line only when the whole title and the time fit in the chip; otherwise the chip shows the title alone, ellipsized. An all-day chip shows its title only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | DD5                                                                  | settled      |
| FR19 | When the month view is built with `renderPopover`, the view calls it during render for each painted chip with the caller's `CalendarEvent`. A chip whose content is not `null` or `undefined` is a native `<button type="button">` the view renders inside the cell of the chip's first day in its week and paints across the chip's days, with its accessible name (AR8) and the popup attributes `aria-haspopup="dialog"`, `aria-expanded`, and `aria-controls`; click, tap, Enter, and Space toggle that event's popover. A chip whose content is `null` or `undefined` is painted as in the read-only month and exposed as static text in the same cell; it is never a button. A multi-day event paints one chip, and so one button, per week it covers. In this mode the cells' hidden event lists are not rendered: each cell exposes, in level order, the chips that start in it and, for each painted chip that started on an earlier day of its week, a static, non-focusable mention of that event; then its "+N more". Each painted event has one button, and no day it covers reads as free.                                                             | DEC-7; DEC-1                                                         | settled      |
| FR20 | The month view owns exactly one popover, the one FR17 opens for a busy day. It shows a day's list or one event's `renderPopover` content, never both, through `component:Popover` with that component's defaults, named by the full date for a day and by the event's `title` for an event. Opening another event or day closes the open one and opens the next in the same gesture. With `renderPopover`, each row of a day's list whose event has content is a native button; activating it closes the list and opens that event's content in the same gesture, anchored to the day's "+N more", and focus returns to that "+N more" on close. A row whose event has no content stays read-only. The popover closes when it is dismissed and when its trigger is no longer rendered — the chip leaves the range or its levels, the day's "+N more" goes away, the range is paged, or the view is swapped — and each trigger's `aria-expanded` reflects what is open and nothing else. The content is `renderPopover(event)` for the open event only and re-renders with the event object of the same `id`.                                                         | DEC-7; DEC-5; `component:Popover`                                    | settled      |
| FR21 | In the week and day views a timed event that lasts 24 hours or more, measured from its start to its end instant, is painted as a span in the all-day row across the days it touches within the range and takes a level there with the date-only events; it is never painted as blocks in the day columns and takes no part in their overlap clusters (FR7). Its pill shows the title first, then its start and end times on the same line only when the whole title and the times fit; otherwise the title alone, ellipsized. The hidden read-only grid lists it in the all-day cells of those days and in no hour cell. A timed event shorter than 24 hours stays in the day columns, one block per day it touches.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | DEC-8                                                                | settled      |

### Allowed variation

- **AV1 — Hour window and density.** Callers choose `minHour`, `maxHour`, and
  `hourHeight`; FR4's lead scales with `hourHeight`, and FR3's alignment holds
  for any window.
- **AV2 — Container height.** The time grid is 640px tall by default and
  shrinks to a shorter Schedule root; the viewport is whatever remains below
  the frame header, and FR4's clamp follows the measured height.
- **AV3 — Column minimum.** Day columns are at least 140px wide and share the
  remaining width equally; narrower viewports scroll on the inline axis under
  FR1 rather than squeezing columns.
- **AV4 — Cluster width.** Blocks in a cluster split the column equally; a
  block that can expand into free columns does, so widths differ within one
  cluster without changing anyone's order.
- **AV5 — Event button styling.** A focused or hovered event button may rise
  and show the focus ring inside its column; themes vary the ring through the
  shared focus tokens. The open event's button carries `aria-expanded="true"`,
  so a theme may style the open state from the rendered attribute.
- **AV6 — Month chip time.** Whether a month chip's time fits beside its whole
  title follows the rendered text, so it varies with locale, the theme's type
  scale, and column width.

### Representative states

| State                                                                       | Required invariant                                                                                                                                                                                                                                       | Allowed variation                          |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Week, today in range, afternoon                                             | opens with the hour before now at the top of the column area; now-line visible                                                                                                                                                                           | hour window, hour height, container height |
| Week, today in range, near midnight                                         | opens at the maximum offset; now-line visible                                                                                                                                                                                                            | same                                       |
| Week, today not in range                                                    | opens at offset 0                                                                                                                                                                                                                                        | same                                       |
| Loader resolves after the person scrolled                                   | offset unchanged                                                                                                                                                                                                                                         | loader latency                             |
| Clock tick, resize, theme change, data refresh                              | offset unchanged                                                                                                                                                                                                                                         | any                                        |
| Two identical events (same title and minutes)                               | two equal half-width blocks; order by `id`                                                                                                                                                                                                               | column width                               |
| Three and five simultaneous events                                          | three thirds, five fifths; every block ≥ 1 pixel visible and uncovered; time line hidden where it no longer fits                                                                                                                                         | column width                               |
| Chain A–B–C where A and C do not meet                                       | A and C share a column, B beside them                                                                                                                                                                                                                    | which of A/C expands                       |
| Long event containing a short one                                           | both visible side by side for the overlap; the long one keeps its full height                                                                                                                                                                            | widths                                     |
| A 48-hour timed event in a week                                             | one span in the all-day row across the days it touches; no block in those columns, so the day's other events keep their full width                                                                                                                       | which level it takes                       |
| A 10 PM–2 AM timed event                                                    | one block on each of the two days                                                                                                                                                                                                                        | none                                       |
| Midnight to midnight on a 23-hour daylight-saving day                       | blocks in that day's column: 23 hours is under the threshold                                                                                                                                                                                             | none                                       |
| Midnight to midnight on a 25-hour daylight-saving day                       | one span in the all-day row                                                                                                                                                                                                                              | none                                       |
| Classic 15px scrollbar, 1280px wide                                         | header/body edges within 1px for every column                                                                                                                                                                                                            | scrollbar width                            |
| 760px wide, scrolled 160px on the inline axis                               | header moves with the columns; gutter and corner stay; one inline scroller; page does not widen                                                                                                                                                          | scroll amount                              |
| Right-to-left direction                                                     | FR3 holds with columns and pins mirrored                                                                                                                                                                                                                 | locale                                     |
| `renderPopover`, keyboard                                                   | Tab reaches the viewport, then each event button in DOM order; Enter or Space opens the popover, focus moves into it, the button reads `aria-expanded="true"`; Escape closes it, focus returns to the same button, `aria-expanded="false"`; ring visible | ring tokens                                |
| `renderPopover` absent                                                      | no button; hidden read-only grid announces events; viewport is the single tab stop while it overflows                                                                                                                                                    | none                                       |
| `renderPopover`, screen reader                                              | day groups of named buttons and the all-day group; each button announces `aria-haspopup="dialog"` and its expanded state and controls the open dialog, which is named by the event title; no hidden read-only grid, so nothing is announced twice        | none                                       |
| `renderPopover`, one event open, another activated                          | the first closes and its button reads `aria-expanded="false"`; the second opens and its button reads `aria-expanded="true"`; one dialog exists                                                                                                           | none                                       |
| `renderPopover`, one event open, that event removed or paged out            | the popover closes; the block and its button unmount; no orphan dialog remains and nothing else in the grid moves                                                                                                                                        | none                                       |
| `renderPopover` returns `null` for an event                                 | that block is painted as read-only and exposed as static text inside its day group; no button, no popup attributes                                                                                                                                       | none                                       |
| `renderPopover`, light dismiss                                              | clicking the grid outside the dialog closes it; the button reads `aria-expanded="false"` and keeps focus if it had it                                                                                                                                    | none                                       |
| Month, a day with three events                                              | three chips; no "+N more"                                                                                                                                                                                                                                | none                                       |
| Month, a day with five events, one of them a three-day event on level three | two chips and "+3 more" on that day; the three-day chip paints on its other days                                                                                                                                                                         | which events take levels one and two       |
| Month, "+N more" activated by keyboard                                      | a dialog named by the full date lists all five events; Escape closes it and focus returns to the "+N more" button                                                                                                                                        | none                                       |
| Month, a day open, a refresh leaves that day three events                   | the popover closes, focus moves to that day's cell, and no dialog remains                                                                                                                                                                                | none                                       |
| Month chip, long title in a 112px column                                    | the title alone, ellipsized; no time                                                                                                                                                                                                                     | column width                               |
| Month chip, short title in a wide column                                    | the title, then the start time                                                                                                                                                                                                                           | locale                                     |
| Month, `renderPopover`, a chip pressed                                      | its button reads `aria-expanded="true"`; one dialog named by the event title holds the caller's content; Escape returns focus to the chip                                                                                                                | none                                       |
| Month, `renderPopover`, a busy day's list, a row pressed                    | the list closes and that event's dialog opens in the same gesture, anchored to the day's "+N more"; Escape returns focus to the "+N more"                                                                                                                | none                                       |
| Month, `renderPopover` returns `null` for an event                          | its chip is static text in its start cell and its row in a day's list is not a button                                                                                                                                                                    | none                                       |
| Month, `renderPopover`, screen reader                                       | each cell lists the buttons of the chips that start in it and a static mention of each chip that continues into it, then its "+N more"; no hidden list repeats them                                                                                      | none                                       |

### Transformation and precedence order

- **ORD1 — Timed layout.** Clip each event to the visible hour window → enforce
  the fifteen-minute minimum → sort (start asc, end desc, `id` asc) → assign
  clusters → assign columns first-fit → expand each block into following free
  columns → convert to percentages of the column's minutes and width.
- **ORD2 — Initial position.** On a range key's first layout: a remembered
  offset for that key is restored; otherwise FR4 computes the offset from the
  now-line and clamps it; the offset is assigned synchronously before paint.
  A person's later scroll overwrites the remembered offset; nothing else does.
- **ORD3 — Pinning.** Sticky header cells paint above the columns, the gutter
  above the columns, and the corner above both, all as local order inside the
  isolated viewport.
- **ORD4 — Month layout.** Order events (first day, all-day and multi-day first,
  covering more days first, earlier start, title, `id`) → in that order, give
  each event in each week it covers the lowest level free on all its days there
  → for each day with an event on level four or higher, give its third level to
  "+N more" and count that day's events on level three or higher → paint the
  remaining chips, cutting a span around the days where it is counted.

### Performance and resources

- **PR1 — One measurement per range.** FR4 measures the viewport once per
  range key in a layout effect; no `ResizeObserver`, interval, or scroll-driven
  re-render is added for positioning. Remembering the offset uses one passive
  scroll listener on the viewport for its lifetime.
- **PR2 — Pure layout.** Cluster and column assignment is a pure function of
  the day's events and the hour window, with no DOM reads, and runs during
  render.
- **PR3 — Shared observers.** Keyboard ownership and overflow state come from
  the shared scroll hook; Schedule adds no observers of its own.
- **PR4 — Pure month layout.** Level assignment and the "+N more" counts are a
  pure function of the range's events and days, with no DOM reads, and run
  during render.
- **PR5 — Chip fit in CSS.** Whether a month chip's time fits beside its title
  is decided by layout, never measured in script.

## Accessibility contract

- **AR1 — Reachable viewport.** The time-grid viewport is the keyboard scroll
  owner under `spec:AST-025` FR12: it is in the tab order only while an axis
  overflows, exposes `role="region"` named by the rendered range title
  followed by "time grid", and native Arrow and Page keys scroll it. Its
  keyboard focus ring is a pointer-transparent overlay painted after the
  viewport, inside the edge the frame clips at, so every edge of the ring
  shows above the pinned header and gutter. Losing overflow does not move
  focus.
- **AR2 — Named event buttons.** With `renderPopover`, each button's
  accessible name is the event's title, its time range (or "all day"), its
  category label, and the full date, in that order: the visible text leads
  the name, and the day is added because a button is reached on its own
  rather than inside a dated cell. The time range of a span of 24 hours or
  more carries the dates of its start and its end. In the hidden read-only
  grid, each all-day cell names such a span by its title, its category label,
  and its start and end with their dates.
- **AR3 — Visible focus and popup semantics.** A focused event button shows
  the shared focus ring entirely within its day column; it rises above
  neighbouring blocks locally so the ring is never clipped by a later sibling.
  Each event button carries `aria-haspopup="dialog"`, `aria-expanded` that is
  true only while its event is open, and `aria-controls` naming the view's
  popover. The popover is a modal dialog named by the event title; focus moves
  into it on open and returns to the button that opened it on close, following
  the dialog pattern.
- **AR4 — Decorative parts stay silent.** Header cells, hour labels, hour
  slots, the all-day cell grid, and the now-line are hidden from assistive
  technology individually; the painted viewport itself is exposed so that its
  tab stop and, with `renderPopover`, its buttons are reachable. With
  `renderPopover`, day columns group their buttons and static blocks under
  `role="group"` named with the full date and the all-day row under
  `role="group"` named "All-day events"; without it, the columns and the
  all-day row are hidden whole.
- **AR5 — Read-only grid preserved.** Without `renderPopover`, the hidden
  read-only `grid` with `aria-readonly`, column headers per day, row headers
  per hour, and cells that list each event's accessible label is the time
  grid's accessible representation, and it contains no focusable element.
- **AR6 — Direction and motion.** Pinning, column order, and block offsets use
  logical properties and mirror under right-to-left direction. Initial
  positioning is instant, so reduced-motion preferences have nothing to
  suppress.
- **AR7 — Month table and "+N more".** The month view is a table, not an
  interactive grid: it is named by the month title, the weekdays are its
  column headers, each week row has a row header naming its dates, and each
  cell is named by its full date. A corner column header heads the
  row-header column, so every row has the same columns and each day cell's
  column header is its weekday. The table makes no arrow-key navigation
  promise; a day's "+N more" is an ordinary Tab stop in reading order. The
  button's accessible name is the count and the full date ("2 more events,
  Tuesday, October 6, 2026"; one hidden event reads "1 more event, …"). It
  carries `aria-haspopup="dialog"`, `aria-expanded` that is true only while
  its day is open, and `aria-controls` naming the view's popover, and it shows
  the shared focus ring in full. The popover is a modal dialog named by the
  full date; focus moves into it on open and returns to the button on close.
  When the button is no longer rendered, focus moves to the day's cell, which
  takes programmatic focus without entering the Tab order and shows the
  shared focus ring. The cell's hidden event list keeps naming every event of
  the day, so a screen-reader user hears the whole day without opening it.
- **AR8 — Month event buttons.** With `renderPopover`, a chip button's
  accessible name is the event's title, its time range (or "all day"), its
  category label, and its day — the full date, or for a chip across several
  days its date range — in that order. A row button in a day's list is named
  the same way with the full date. A cell that a chip covers after its first
  day in the week names that event as static text that never takes focus: its
  title, its time range (or "all day"), its category label, and "since" the
  full date the chip started. A focused month event button shows the shared
  focus ring in full and rises above neighbouring chips locally.

## Design relationships

| Anatomy or state | Design requirement                                                                                                                                                                               | Representation authority | Hierarchy role | Component contract     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | -------------- | ---------------------- |
| Day header       | Names each column and stays visible while the day scrolls.                                                                                                                                       | prescribed               | supporting     | FR1–FR3                |
| Hour gutter      | Labels the hour lines and stays visible while columns scroll on the inline axis.                                                                                                                 | prescribed               | supporting     | FR1–FR3                |
| All-day row      | Stacks all-day spans and timed events of 24 hours or more in levels below the header and stays visible while the day scrolls.                                                                    | prescribed               | supporting     | FR1–FR2, FR21          |
| Event block      | Shows title and time in the category color; shares the column with concurrent events; with `renderPopover` it is the button that opens the event popover.                                        | prescribed               | prominent      | FR7–FR12, AR2–AR3      |
| Event popover    | Shows the caller's content for one event on Popover's standard surface and padding, anchored to the event's button.                                                                              | prescribed               | prominent      | FR11–FR12, AR3         |
| Now-line         | Marks the current minute on today's column, above blocks, inside the column.                                                                                                                     | prescribed               | supporting     | FR4, FR9               |
| Month chip       | Shows the title first, then the start time when both fit; spans its days within a week on its level, in the category colour; with `renderPopover` it is the button that opens the event popover. | prescribed               | prominent      | FR15, FR16, FR18, FR19 |
| "+N more"        | Stands in for a busy day's third chip, counts that day's unpainted events, and opens the day popover.                                                                                            | prescribed               | supporting     | FR16, FR17, AR7        |
| Day popover      | Lists every event of one day on Popover's standard surface and padding, anchored to the day's "+N more".                                                                                         | prescribed               | supporting     | FR17, AR7              |

The component implements design requirements without copying their rationale.
An `unsettled` representation remains a human decision; principles do not let an
agent invent the answer.

### Design decisions

<!-- design-decisions:v1 -->

| ID  | Decision                                          | Intent or reason                                                                                                                | Applies to    | Allowed variation             |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------- |
| DD1 | One `hourHeight` of lead above now                | The person sees what just happened and most of what is next without the now-line sitting on the top edge.                       | week, day     | scales with `hourHeight`      |
| DD2 | Equal cluster columns with rightward expansion    | Concurrent events read as concurrent; width is the only axis that changes and every event stays fully perceivable.              | week, day     | expansion into free columns   |
| DD3 | Time line collapses before the title does         | The title identifies the event; the time is already implied by the block's vertical position.                                   | narrow blocks | the container-query threshold |
| DD4 | The popover keeps Popover's standard padding      | Event details read as one of the system's popovers; content is semantic and never wraps itself to supply padding.               | event popover | none in this record           |
| DD5 | Month chips put the title first                   | The title identifies the event; in a month cell the time is the detail a narrow chip drops first.                               | month chips   | whether the time fits         |
| DD6 | A busy day trades its third chip for a count      | Weeks keep one height so the month still reads as a grid; the count says how much is hidden and opens the whole day.            | month view    | none                          |
| DD7 | An event that lasts a day or more reads as a span | A multi-day meeting is one thing across days; as blocks it would fill whole columns and narrow every other event of those days. | week, day     | none                          |

## Family and system relationships

- `spec:AST-002` owns public-API admission. `renderPopover` is caller-owned
  content the view cannot derive (what an event's details say); its absence
  is a complete read-only state (FR13), so both states are independently
  correct. No trigger props, state, or presentation vocabulary is introduced.
- `component:Popover` owns the dialog surface the time grid and the month
  view open: role, name, modality, auto-focus, fallback close, Escape and
  light dismiss, focus return, surface, and padding. Both views compose it
  with its defaults and expose none of its props.
- `spec:AST-025` owns scroll-container behaviour. The time-grid viewport
  integrates the shared hook on existing structure rather than wrapping it;
  keyboard access, chaining, and native scrollbars follow that record.
- `spec:AST-027` owns local stacking. FR9 and FR15 place every Schedule
  `z-index` inside an isolation owner and route nothing through page-level
  bands.
- `architecture:public-component-api` owns stable admission and compatibility;
  Schedule remains experimental in Lab.
- `architecture:react-component-runtime` owns effect and resource lifetime;
  FR5–FR6 and PR1 record Schedule's positioning effect and scroll memory.
- `architecture:component-theming-surface` owns target qualification; this
  record adds no theme target.

## Verification map

| Contract          | Verification                                                                                                                                    | Representative states                                                                                                                                                                                                                 | Mutation or failure expectation                                                                                                                                                                                                                                                                                         | Audit section                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR1–FR3           | `ScheduleTimeGridGeometry.a11y.chromium.spec.ts` (classic scrollbars, 760px inline scroll, RTL, keyboard reach, focus ring)                     | fixed-height week with 15px scrollbar; narrow week scrolled 160px; RTL                                                                                                                                                                | A second scroller, a header outside the viewport, or a non-sticky gutter drifts header or labels past 1px.                                                                                                                                                                                                              | `audit:Schedule/layout`        |
| FR4–FR6           | `TimeGridView.test.tsx` positioning suite with mocked geometry; `ScheduleTimeGridInitialPosition.a11y.chromium.spec.ts` with an installed clock | 15:00 week, 13:00 day, 23:50 day (clamp), range without today, tick/theme/resize after a manual scroll                                                                                                                                | Opening at 0 with today in range, re-running on a tick, or losing the offset across the suspense swap fails.                                                                                                                                                                                                            | `audit:Schedule/behavior`      |
| FR7–FR10          | `timeGridLayout.test.ts` pure-function suite; `ScheduleTimeGridOverlap.a11y.chromium.spec.ts`                                                   | tie, three, five, chain, containment, reversed input order, fifteen-minute block                                                                                                                                                      | Any inter-block overlap above 1px, a dropped event, an input-order-dependent result, or a missing `isolation: isolate` fails.                                                                                                                                                                                           | `audit:Schedule/layout`        |
| FR11–FR14         | `Schedule.test.tsx` popover suite; `ScheduleEventPopover.a11y.chromium.spec.ts` against the `EventPopover` story                                | option absent, present, `null` for one event; open, Escape, light dismiss, switch, removal, paging; month and list unchanged                                                                                                          | A button without the option, a button for a `null` event, two open popovers, a stale `aria-expanded`, an orphan dialog after removal, focus not returning, or focus inside the hidden grid fails.                                                                                                                       | `audit:Schedule/public-api`    |
| AR1, AR4–AR5      | `ScheduleTimeGridGeometry` keyboard-reach case; `Schedule.test.tsx` hidden-grid suite; scoped axe audit of the read-only and popover stories    | overflowing and fitting viewports; read-only week                                                                                                                                                                                     | An unreachable viewport, a focusable node inside `aria-hidden`, or a changed read-only grid fails.                                                                                                                                                                                                                      | `audit:Schedule/accessibility` |
| AR2–AR3, AR6      | `Schedule.test.tsx` name and popup-attribute assertions; `ScheduleEventPopover` focus-ring pixels, focus-return, and RTL cases                  | `EventPopover` story focused by keyboard, open and closed, LTR and RTL                                                                                                                                                                | A name missing the date or category, a clipped ring, a missing `aria-haspopup`, a dialog without the event title as its name, or an unmirrored pin fails.                                                                                                                                                               | `audit:Schedule/accessibility` |
| FR15–FR16         | `monthLayout.test.ts` pure-function suite; `ScheduleMonthOverflow.a11y.chromium.spec.ts`                                                        | three events; five events with a three-day span on level three; titles out of start order; reversed input order; an empty week                                                                                                        | A chip below its row, an event neither painted nor counted, a single-day timed event hidden while a later one that day shows, an order-dependent result, a growing row, or no `isolation: isolate` fails.                                                                                                               | `audit:Schedule/layout`        |
| FR17, AR7         | `Schedule.test.tsx` month suite; `ScheduleMonthOverflow.a11y.chromium.spec.ts`                                                                  | open by click and by keyboard, Escape, light dismiss, switch days, page away; LTR and RTL; light and dark                                                                                                                             | A control that is not a button, a name without the count or the date, two dialogs, a stale `aria-expanded`, focus not returning, a clipped focus ring, or a dialog left open after paging fails.                                                                                                                        | `audit:Schedule/accessibility` |
| AR7 structure     | `Schedule.test.tsx` month table suite; `ScheduleMonthOverflow.a11y.chromium.spec.ts` accessibility-tree and Tab-order readings                  | quiet and busy months; Tab from the pager through the scroll container to each "+N more" in reading order; screen-reader names of headers, cells, and buttons; the Sunday cell's column header read as Sunday                         | A `grid` role or `aria-readonly`, a missing column, row, or corner header, a cell whose column header is not its weekday, a cell named without its full date, or a "+N more" outside the Tab order fails.                                                                                                               | `audit:Schedule/accessibility` |
| FR17 close rule   | `Schedule.test.tsx` month suite; `ScheduleMonthOverflow.a11y.chromium.spec.ts` refresh case                                                     | a day opened by keyboard, then a refresh leaves it three events; a day open, then the range paged                                                                                                                                     | A dialog left open, a stale `aria-expanded`, focus left on the page body while the day's cell is still rendered, a cell in the Tab order, or a focused cell without the shared focus ring fails.                                                                                                                        | `audit:Schedule/behavior`      |
| FR18              | `ScheduleMonthChip.a11y.chromium.spec.ts`                                                                                                       | long title at 800px, short title at 1280px, all-day chip, RTL                                                                                                                                                                         | A time painted before the title, a time that truncates the title, or a time on an all-day chip fails.                                                                                                                                                                                                                   | `audit:Schedule/layout`        |
| FR19 covered days | `Schedule.test.tsx` month popover suite; `ScheduleMonthEventPopover.a11y.chromium.spec.ts`                                                      | a three-day span read on each day it covers, by keyboard and by the accessibility tree; a span that began the week before                                                                                                             | A covered day with no mention of its event, a mention that is a button or takes focus, or a second button for the same chip fails.                                                                                                                                                                                      | `audit:Schedule/public-api`    |
| FR19–FR20, AR8    | `Schedule.test.tsx` month popover suite; `ScheduleMonthEventPopover.a11y.chromium.spec.ts`                                                      | option absent, present, `null` for one event; open by click, tap, and keyboard; Escape, light dismiss, switch between events and days, a row in a busy day's list, removal, paging; LTR and RTL                                       | A month button without the option, a button for a `null` event, a button outside its start cell, a hidden list beside the buttons, two dialogs, a stale `aria-expanded`, a nested dialog, focus not returning to the chip or the "+N more", or a clipped ring fails.                                                    | `audit:Schedule/public-api`    |
| FR21              | `TimeGridView.test.tsx` long-span suite; `ScheduleTimeGridLongSpan.a11y.chromium.spec.ts`                                                       | 48-hour event across a week; exactly 24 hours; 23 hours 59 minutes; 10 PM–2 AM; midnight to midnight on a 23-hour and on a 25-hour daylight-saving day; a long title and a short title; with and without `renderPopover`; LTR and RTL | A long event painted as column blocks or splitting a cluster, a short overnight event moved to the all-day row, a span whose edges miss its day columns by more than 1px, a span pill whose times precede or truncate its title, an hour cell that lists a long event, or a name without its start and end dates fails. | `audit:Schedule/layout`        |

## Decision log

<!-- Record the boundary or requirement, not how it was reached. A rejected alternative is at most one line here, kept only when it is consequential and likely to recur. -->

### DEC-1 — The time-grid views own an event popover; callers supply its content

**Reference:** `component:Schedule/DEC-1`
**Decider:** cixzhang, 2026-10-04

Interaction belongs to a view, because what an event is and how it is reached
differ between a time grid, a month cell, a list row, and a custom view.
Schedule and its context carry no activation callback. The week and day views
share one option, `renderPopover(event)`, and own everything around it: the
native event button and its popup attributes, the single Popover instance,
which event is open, the anchor, the dialog name, dismissal, focus return, and
closing when the event leaves the grid. The caller returns content for an
event, or `null` to leave that event read-only, and receives nothing else.
Absent the option, the grid is read-only. Month and list views have no
interaction option here; each adopts its own in its own record change.

Rejected: an activation callback on Schedule or in the context — one model
cannot fit every view, and a callback beside view-owned ARIA can disagree.
Rejected: composing a caller-owned surface around the view's trigger — the
view cannot know what it is composed with, and two owners write one button.
Rejected: a render prop that replaces the event's content — it moves colour,
past dimming, and time formatting into every product.

### DEC-2 — Simultaneous events share the column side by side

**Reference:** `component:Schedule/DEC-2`
**Decider:** cixzhang, 2026-10-04

Concurrency is shown by width, never by paint order: an overlap cluster splits
its column into equal tracks, a block expands into following free tracks, and
no block is ever covered, so there is no rank to expose and no `z-index` between
blocks. Order inside a cluster is fixed by start, length, and `id`, which makes
the layout a function of the data alone.

Rejected: a cascade with each later level inset and raised above the previous
one, because the later block hides the earlier one's title and the order
depends on input order.

### DEC-3 — A range containing today opens one hour before now, once

**Reference:** `component:Schedule/DEC-3`
**Decider:** cixzhang, 2026-10-04

The viewport opens where the person's attention is: the hour before now at the
top, clamped to the grid. It does this exactly once for each range a person
opens and then leaves the scroll alone, including across the suspended
fallback, so neither a late loader nor a clock tick can move what they are
reading. The component derives this from the clock and the range, so no prop
selects it.

Rejected: an `initialScroll` prop, because no caller-owned distinction between
two otherwise identical schedules has been shown.

### DEC-4 — One scroll owner with sticky header, all-day row, and gutter

**Reference:** `component:Schedule/DEC-4`
**Decider:** cixzhang, 2026-10-04

Header, all-day row, gutter, and columns are items of one grid inside one
viewport, pinned with `position: sticky`, so their tracks are the same tracks
and a scrollbar, a zoom level, or an inline scroll cannot separate them. The
viewport reserves its scrollbar gutter and is the keyboard scroll owner.

Rejected: a header outside the viewport kept aligned by scroll synchronisation
or a scripted scrollbar-width constant, because it drifts under every
scrollbar presentation it was not measured on.

### DEC-5 — The event popover is a standard Popover with no presentation options

**Reference:** `component:Schedule/DEC-5`
**Decider:** cixzhang, 2026-10-04

The event popover is `component:Popover` with its defaults: dialog role named
by the event title, modal, auto-focus, fallback close, Escape and light
dismiss, standard surface and padding. The view option exposes no Popover
prop — no padding, placement, width, dismissal, or controlled state — and no
close or controls argument, so content stays semantic and the view can change
how it presents the popover without changing the option. The popover is
presented as a popover at every pointer type and width.

Rejected: a padding or full-bleed escape — a future need is a separate
presentation decision on this record.
Rejected: a configuration object beside the content function — no second
inseparable option exists.

### DEC-6 — A busy month day shows a count that opens the whole day

**Reference:** `component:Schedule/DEC-6`
**Decider:** cixzhang, 2026-10-06

Every month week row keeps one height and paints at most three levels of
chips. When a day needs more, its third level becomes a "+N more" button that
counts the events not painted there and opens the view's one popover, which
lists every event of that day. No event is dropped and nothing paints outside
its row; the hidden per-cell list keeps the whole day for assistive
technology. The layout is derived from the data, so no prop selects it.

Rejected: rows that grow to fit — weeks of different heights stop reading as
one grid and push later weeks out of view.
Rejected: a count that opens nothing — the hidden events stay out of reach for
sighted people.
Rejected: a "+N more" that switches to the day view — it needs an activation
callback on Schedule, which DEC-1 keeps out.

### DEC-7 — The month view offers the time grid's event popover

**Reference:** `component:Schedule/DEC-7`
**Decider:** cixzhang, 2026-10-06

The month view takes the same `renderPopover` option as the week and day
views and owns the same kind of popover: one instance, opened from a native
button the view renders, named by the event title, with the caller's content
and nothing else. A chip button lives in the cell where the chip starts, so
the month keeps one table structure in both modes, and the buttons replace
the cells' hidden lists so each event is announced once. The day popover is
that same instance: a busy day's list hands an event to it in one gesture,
and focus comes back to the day's "+N more". Pressing that "+N more" while
one of its events is open shows the day's list again in the same gesture;
that return is intended, and the popover keeps no back step of its own.

Rejected: groups in place of the table when the option is present — the
month keeps one accessible structure.
Rejected: a second popover over the day's list — two modal dialogs stack focus
traps and dismissals.

### DEC-8 — A timed event of 24 hours or more is an all-day span

**Reference:** `component:Schedule/DEC-8`
**Decider:** cixzhang, 2026-10-06

In the week and day views a timed event that lasts 24 hours or more is a span
in the all-day row, like a date-only event, rather than a block in each day
column. A block that tall tells the person nothing the span does not, and it
would take a track of every overlap cluster on those days. The threshold is
measured on the event's own instants, so it does not depend on the hour
window or the timezone's day length.

Rejected: moving every event that crosses midnight to the all-day row — a
late meeting that ends after midnight belongs in the hours it occupies.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
