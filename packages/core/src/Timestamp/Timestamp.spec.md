---
schema_version: 3
template_version: 7
kind: component
id: component:Timestamp
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/hooks/useClipboard.test.tsx,
    .github/visual-baseline/manifest.json,
    packages/core/src/Timestamp/Timestamp.test.tsx,
    packages/core/src/Timestamp/tooltipEntries.test.ts,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/Timestamp.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:internationalization,
    architecture:public-component-api,
    architecture:react-component-runtime,
  ]
contributing: []
system_specs: [spec:AST-009, spec:AST-085]
---

# Timestamp component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A `time` element for a `value` (Unix seconds, milliseconds, or ISO 8601) in one of twelve `format`s, with optional live updates, time-zone suffix, and a copyable hover card.                                                      |
| Behavior                | Relative output carries the full absolute date as its default accessible name; relative output, or configured `tooltipEntries`, attach a keyboard-reachable hover card of copyable rows.                                           |
| End-user impact         | Readers see compact or exact times in their locale; screen-reader users hear the full date and time zone; keyboard users can open and copy the exact time.                                                                         |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                                                                       |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. Four implementation gaps are listed under Current-state impact.                                                                                         |
| Review checks           | Reject a relative timestamp without the full absolute name when the caller names nothing, a hover card without a tab stop, a change that makes more server markup depend on the server's zone, or a crash on an unparseable value. |
| Governing rules         | `architecture:internationalization/INV4,INV8,INV10`; `architecture:react-component-runtime/INV1,INV3,INV5`; `architecture:public-component-api/INV5,INV6,INV8`.                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

Timestamp shows one instant as human-readable text with machine-readable
semantics. It owns choosing and formatting the display, keeping relative
output current, the accessible name, and the hover card that reveals and copies
the exact time.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes
- Controlled/uncontrolled behavior: not applicable; the current clock is
  internal state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Caller name and tab stop replaced (FR5, FR9).** On relative output the
  full-date name replaces a caller `aria-label`, and while a card is attached
  the component's `tabIndex={0}` replaces a caller `tabIndex`, where
  `architecture:public-component-api` INV5 lets a caller's explicit input reach
  the element.
- **Focus lost when the card attaches (FR6, AR3).** While the card module
  loads, a fallback `time` with the tab stop renders; when the card attaches it
  replaces that element, so keyboard focus placed on it falls to the page body
  and no card opens, where `spec:AST-085` FR4 keeps focus on a control that
  stays available.
- **Card fails the description-list structure (FR7).** Once any row is
  copyable, every row puts an action cell, a `div` (empty on read-only rows),
  inside its row group in the card's `dl`, so the open card fails the
  `definition-list` structure check (WCAG 2.2 1.3.1); the default card always
  has a copyable row. A card with no labelled rows,
  the default card included, also renders each row as a lone `dd` with no
  `dt`, so its values have no names.
- **Absolute formats depend on the server's zone (FR3).** An absolute format
  other than `unix_seconds` renders in the host's time zone, so the same instant reads "Mar 25" from a
  UTC server and "Mar 26" from a Tokyo server, and a viewer in another zone
  gets a hydration text mismatch.

## Ownership boundary

**Owns**

- The `time` element, its `datetime` attribute, and the Text wrapper carrying
  the `timestamp` target.
- Value parsing, format selection, formatting, the time-zone suffix, and live
  updates.
- The accessible name of relative output.
- The hover card's rows, layout, copy buttons, and copy announcement.

**Does not own / non-goals**

- Hover card opening, placement, and dismissal — owned by HoverCard.
- Typography — delegated to `component:Text`.
- Locale and calendar resolution — owned by `architecture:internationalization`
  helpers.
- Clipboard writing and its live-region announcement mechanics — owned by the
  shared clipboard hook.

## Public concepts

| Concept         | Closed values or states                                                                                                                                          | Meaning                                                   | Availability by variant/orientation/state   | Default  | Owner                 | Stability | Invalid-value behavior                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- | -------- | --------------------- | --------- | -------------------------------------------------------------- |
| Value           | Unix seconds (below 10¹²), Unix milliseconds, or an ISO 8601 string                                                                                              | The instant shown.                                        | Always                                      | Required | `component:Timestamp` | Stable    | An unparseable value renders nothing and warns in development. |
| Format          | `relative`, `relative_short`, `auto`, `date`, `date_long`, `date_weekday`, `date_time`, `time`, `system_date`, `system_date_time`, `system_time`, `unix_seconds` | How the instant is written.                               | Always                                      | `auto`   | `component:Timestamp` | Stable    | TypeScript rejects other values.                               |
| Hover card rows | default (one copyable full-date row); configured `tooltipEntries`                                                                                                | What the hover card shows; each row may opt into copying. | Relative output, or any output with entries | default  | `component:Timestamp` | Stable    | An empty entry list counts as no configuration.                |
| Live            | on; off                                                                                                                                                          | Whether relative output refreshes.                        | Relative output                             | off      | `component:Timestamp` | Stable    | —                                                              |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Basis                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | Timestamp renders a Text element (default `type="supporting"`, `color="secondary"`, with `size` and `weight` passed through) carrying the `timestamp` target, which reflects the resolved format beside Text's type and color reflection; inside it an inline `time` element inherits the typography and carries the instant's ISO 8601 `datetime`. An unparseable value renders nothing and logs a development warning.                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests |
| FR2 | `auto` shows `relative` when the instant is within `autoThreshold` seconds of now (default seven days) and `date_time` otherwise. `relative` uses the locale's long relative phrase and `relative_short` its narrow phrase; a value a few seconds in the future reads as "now". Absolute formats use the shared instant formatter in the provider locale with Gregorian years; `system_*` formats are machine-readable, and `unix_seconds` is zone-independent. `isTimezoneShown` appends the zone abbreviation to `date_time` and `time` only.                                                                                                                                                                                                                                                                                                                | Current source and tests |
| FR3 | Server markup does not depend on the server's time zone and hydrates without a mismatch. A format that needs the clock renders `date_time` in UTC with the zone shown until the client can read the clock; the client then shows the resolved format without committing the UTC placeholder. Implementation gap: absolute formats other than `unix_seconds` render in the host's time zone, so their server markup depends on the server's zone and hydrating it in another zone produces a text mismatch (Current-state impact).                                                                                                                                                                                                                                                                                                                              | Current source and tests |
| FR4 | With `isLive` and relative output, the clock refreshes every second under a minute old, every 30 seconds under an hour, every minute under a day, and every five minutes beyond; the timer is cleared on unmount or when the inputs change. Locale changes update the output live.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source and tests |
| FR5 | Relative output is named by the full absolute date and the long time-zone name unless a caller names the element; absolute output adds no name. A caller's explicit `aria-label` reaches the element (`architecture:public-component-api` INV5). Implementation gap: the component's full-date name replaces a caller `aria-label` on relative output (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests |
| FR6 | When `hasTooltip` is true and the output is relative or `tooltipEntries` is non-empty, a lazily loaded HoverCard named "Timestamp details" attaches above the timestamp, opening on hover and on keyboard focus; the `time` element gains `tabIndex={0}`. Otherwise no card renders and no tab stop is added. Focus placed on the timestamp stays there when the card attaches (`spec:AST-085` FR4). Implementation gap: while the card module loads, a fallback `time` with the tab stop renders, and attaching the card replaces it, so focus placed on it falls to the page body and no card opens (Current-state impact).                                                                                                                                                                                                                                  | Current source and tests |
| FR7 | The card is a description list in a grid: an optional label column (present when any row has a label), the value column, and a trailing action column (present when any row is copyable). Without entries it has one copyable row with the full absolute time in the viewer's zone. Each configured entry is one row in the given order, rendered in its own time zone and format, read-only unless `isCopyable`. An unknown time zone does not crash. A description list holds only name-value groups (WCAG 2.2 1.3.1). Implementation gaps: once any row is copyable, every row carries an action-cell `div` inside its row group (empty on read-only rows), so the open card fails the `definition-list` structure check, and a card with no labelled rows, the default card included, renders each row as a lone `dd` with no `dt` (Current-state impact). | Current source and tests |
| FR8 | A copy button is a small ghost IconButton on the `timestamp-copy-button` target, named "Copy {value}" with a "Copy" tooltip; activating it writes the row's value to the clipboard, switches to a check icon and the "Copied" name and tooltip for 1.5 seconds, and announces "Copied" politely. A clipboard rejection does nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Current source and tests |
| FR9 | `ref`, `data-testid`, and other supported DOM, ARIA, data, and event props reach the `time` element; `xstyle`, `className`, and `style` reach the Text wrapper. A caller `aria-labelledby` names the element in place of FR5's name. A caller's explicit `tabIndex` reaches the element (`architecture:public-component-api` INV5). Implementation gap: while a card is attached, the component's `tabIndex={0}` replaces a caller `tabIndex` (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                          | Current source and tests |

### Allowed variation

- **AV1 — Locale wording.** Phrases, month names, and zone names follow the
  provider locale.
- **AV2 — Theme paint.** A theme may restyle `timestamp` per format, type, and
  color, and `timestamp-copy-button`, without changing the output text.

### Representative states

| State                 | Required invariant                                                                                                                                        | Allowed variation |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Relative, recent      | Relative phrase; full-date name; tab stop; hover card with one copyable row.                                                                              | Locale.           |
| Auto, old             | `date_time`; no name; no card unless entries are configured.                                                                                              | Threshold.        |
| Absolute with entries | Card attached with configured rows; tab stop; no added name.                                                                                              | Entries.          |
| Server render         | Markup identical across server zones; clock-dependent formats show UTC `date_time` with zone (absolute formats use the server's zone today, the FR3 gap). | —                 |
| Live                  | Relative phrase refreshes at the tier's interval.                                                                                                         | —                 |
| Unparseable           | Nothing rendered; development warning.                                                                                                                    | —                 |
| `hasTooltip={false}`  | No card and no tab stop, even with entries.                                                                                                               | —                 |

### Transformation and precedence order

- **ORD1 — Display format.** Clock pending → UTC `date_time`; else `auto` →
  relative or `date_time` by threshold; else `format`.
- **ORD2 — Card rows.** Non-empty `tooltipEntries` → the default full-date row.
- **ORD3 — Time element attributes.** `datetime` and `data-testid` are set,
  then caller props; the relative name and the card's tab stop apply only
  where the caller sets no `aria-label` or `tabIndex` (today they overwrite
  the caller's, the FR5 and FR9 gaps).

### Performance and resources

- **PR1 — Bounded work.** Only relative output with `isLive` runs a timer, at
  most one per instance, cleared on change or unmount; the hover card module
  loads only when a card is attached; copy state exists only for copyable rows.

## Accessibility contract

- **AR1 — Machine-readable instant.** The `time` element carries the ISO 8601
  instant in `datetime`.
- **AR2 — Full name for relative output.** Relative output is named by the full
  absolute date with the spelled-out time zone (WCAG 2.2 3.1.4).
- **AR3 — Keyboard-reachable card.** While a card is attached the timestamp is
  a tab stop and the card opens on focus; the trigger carries no
  `aria-expanded`. Without a card there is no tab stop. Implementation gap:
  focus placed on the timestamp before the card module loads is lost when the
  card attaches (FR6). The popup relationship sits on the Text wrapper rather
  than the focused `time` and is not contracted.
- **AR4 — Copy feedback.** Copy buttons are named with their value, and a copy
  is announced politely.

## Design relationships

| Anatomy or state | Design requirement                                                   | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Formatted text   | The instant in compact or exact form, in supporting type by default. | Current source and docs  | Prominent      | FR1–FR5            |
| Hover card       | A copyable card with the exact time or configured rows.              | Current source and docs  | Supporting     | FR6, FR7, AR3      |
| Hover card row   | An optional label beside one rendering of the instant.               | Current source and docs  | Supporting     | FR7                |
| Copy button      | Copies one row's value with brief confirmation.                      | Current source and docs  | Supporting     | FR8, AR4           |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Formatted text": {"target": "timestamp"},
  "Hover card": {
    "delegatesTo": {"owner": "component:HoverCard", "target": "hover-card"}
  },
  "Hover card row": {
    "none": {
      "reason": "reachability-gap: rows render inside the hover card content without a component-owned class"
    }
  },
  "Copy button": {"target": "timestamp-copy-button"}
}
```

## Family and system relationships

- `architecture:internationalization` owns locale resolution, live locale
  changes, the shared formatter, and Gregorian defaults; FR2 and FR4 rely on
  them.
- `architecture:react-component-runtime` owns valid initial render and timer
  cleanup; FR3 and FR4 apply them.
- HoverCard owns the card surface; Timestamp supplies its content, name, and
  trigger focusability.

## Verification map

| Contract            | Verification                                                                                                         | Representative states                                          | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                           | Audit section              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| FR1, FR2            | `Timestamp.test.tsx` format, auto, locale, and invalid-value tests; stable visual baseline `core-timestamp--default` | Every format; thresholds; locales; unparseable values; default | A wrong phrase, a crossed tier, a non-Gregorian year, a missing `time` element or `datetime`, a crash, or a missing development warning for an unparseable value fails; a changed default type or color comes back changed for review. Gap: no test asserts the `timestamp` target or its format reflection.                                                                                                                                              | `audit:Timestamp/behavior` |
| FR3                 | `Timestamp.test.tsx` server-rendering suite                                                                          | Server zones; hydration                                        | Zone-dependent markup, a hydration mismatch, or a committed placeholder fails. Gap: no test covers an absolute format rendered on a server in another zone.                                                                                                                                                                                                                                                                                               | `audit:Timestamp/behavior` |
| FR4, PR1            | `Timestamp.test.tsx` live-update and locale tests                                                                    | Live relative output; locale change                            | A missing refresh or a stale locale fails. Gap: the per-tier refresh intervals and the timer cleanup on unmount or input change have no automated check.                                                                                                                                                                                                                                                                                                  | `audit:Timestamp/behavior` |
| FR5, AR2            | `Timestamp.test.tsx` naming tests                                                                                    | Relative, absolute, time-zone spelling                         | A missing or short-zone name, or a name on absolute output, fails. The pass-through test "keeps its own spelled-out label on a relative timestamp" pins the caller-`aria-label` replacement, which is the recorded gap, not the contract.                                                                                                                                                                                                                 | `audit:Timestamp/a11y`     |
| FR6, AR3            | `Timestamp.test.tsx` keyboard-reachability suite                                                                     | Relative, absolute, disabled, entries removed                  | A missing tab stop, `aria-expanded` on the trigger, or a stray tab stop fails. The aria-expanded test also pins `aria-haspopup` on the Text wrapper, which is current behavior, not contract. Gap: no test covers focus on the timestamp while the card module loads, or `aria-controls`.                                                                                                                                                                 | `audit:Timestamp/a11y`     |
| FR7, FR8, AR4       | `Timestamp.test.tsx` hover-card suites; `tooltipEntries.test.ts`; `useClipboard.test.tsx`                            | Default row, entries, copyable rows, unknown zone              | A wrong row count or order, an unpaired label, a copy button on a read-only row, a wrong copied value, a missing copied state, or a missing announcement fails. Gap: no check runs the `definition-list` structure rule on the open card (the recorded gap); the grid columns and the 1.5-second reset have no automated check; `useClipboard.test.tsx` covers the clipboard-rejection no-op. The lone-`dd` rows of a label-less card are also unchecked. | `audit:Timestamp/behavior` |
| FR9                 | `Timestamp.test.tsx` ref, test-id, and pass-through tests                                                            | Ref, test id, caller props                                     | A ref, test id, or caller prop missing from the `time` element fails. Gap: no test asserts that `xstyle`, `className`, and `style` reach the Text wrapper, or covers a caller `aria-labelledby` or `tabIndex`.                                                                                                                                                                                                                                            | `audit:Timestamp/behavior` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                        | Consumer anatomy, targets, HoverCard delegate                  | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                                                                                                                                                                             | `audit:Timestamp/theming`  |
| AR1                 | `Timestamp.test.tsx` `datetime` tests                                                                                | `date_time`; `date`                                            | A missing or wrong ISO `datetime` on `date_time`, or a missing one on `date`, fails. Gap: no test asserts the exact `datetime` on relative or other absolute formats.                                                                                                                                                                                                                                                                                     | `audit:Timestamp/a11y`     |
| AR2, AR4            | Accessibility-tree evidence (`spec:AST-009` FR3)                                                                     | Relative output; copy buttons                                  | Gap: no accessibility-tree check proves the computed name of relative output or the copy-button names; the unit tests query the DOM.                                                                                                                                                                                                                                                                                                                      | `audit:Timestamp/a11y`     |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
