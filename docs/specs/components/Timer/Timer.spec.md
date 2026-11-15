---
schema_version: 3
template_version: 5
kind: component
id: component:Timer
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-22
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility, react-runtime]
verified_by:
  [
    packages/core/src/Timer/Timer.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:react-component-runtime,
  ]
contributing: []
system_specs:
  [
    spec:AST-002/DEC-1,
    spec:AST-037/DEC-1,
    spec:AST-037/DEC-2,
    spec:AST-037/DEC-3,
  ]
---

# Timer component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Timer`, `TimerProps`, `TimerFormat`, optional `startTime` Unix milliseconds, `elapsed` or `clock` format, Timestamp-equivalent `type`, `size`, `color`, and `weight`, `<time>` ref, and `BaseProps<HTMLTimeElement>`.                                                        |
| Behavior                | One semantic duration uses a standardized seconds-to-hours ladder and updates its owned DOM node without React tick renders; elapsed output drops to minute cadence after one hour.                                                                                           |
| End-user impact         | People watching active work see a stable, consistent duration without unnecessary timer work competing with the surrounding interface.                                                                                                                                        |
| Builder impact          | Zero-config starts on mount with Timestamp's supporting typography; callers choose only an earlier origin, standard format, or standard typography override.                                                                                                                  |
| Compatibility/readiness | Additive first release implementing current `spec:AST-037`; no existing API or behavior changes.                                                                                                                                                                              |
| Review checks           | Reject custom formatters/cadence, state-driven ticks, callback-count drift, post-hour elapsed second wakes, typography divergence from Timestamp, leaked resources, negative output, lost passthrough/ref behavior, unsolicited live announcements, or extra anatomy/targets. |
| Governing rules         | `spec:AST-037`; `architecture:public-component-api`; `architecture:react-component-runtime`; `architecture:component-theming-surface`.                                                                                                                                        |

This table is a review projection; the body below is authoritative.

## Intent

Timer is the stable Core projection of `spec:AST-037`. It presents a standardized
elapsed duration for active work while keeping clock ticks outside React's render
lifecycle. Its typography surface and defaults match Timestamp so the two temporal
content components behave consistently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive component and type exports
- Controlled/uncontrolled behavior: not applicable
- Migration decision: `spec:AST-037/DEC-1`, `spec:AST-037/DEC-2`, and
  `spec:AST-037/DEC-3`

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Elapsed calculation from mount or a finite caller origin.
- The `elapsed` and `clock` representation ladders and their visible precision.
- One `<time>` element, its visible value, synchronized ISO duration, and timer
  resource lifecycle.
- Avoiding React update commits for clock ticks.
- Timestamp-equivalent `type`, `size`, `color`, and `weight` behavior.
- The `timer` theming target on the Text wrapper.

**Does not own / non-goals**

- Loading indicators, waiting copy, status, or visibility — product composition.
- Dates, relative calendar language, time zones, or absolute instants — Timestamp.
- Pause, resume, countdown, deadlines, alarms, laps, sub-second precision, custom
  formatters, or caller-controlled scheduling cadence.
- Automatic live-region announcements.

Countdown is deferred to a later contract. The standard formatting and scheduling
helpers remain direction-independent so that extension does not require replacing
the current format API.

## Public concepts

| Concept         | Closed values or states                   | Meaning                                              | Availability | Default                                                                        | Owner             | Stability | Invalid-value behavior                                     |
| --------------- | ----------------------------------------- | ---------------------------------------------------- | ------------ | ------------------------------------------------------------------------------ | ----------------- | --------- | ---------------------------------------------------------- |
| Elapsed origin  | Mount time or finite `startTime`          | Unix-millisecond origin for elapsed duration         | Always       | Mount time                                                                     | `component:Timer` | Stable    | Non-finite values fall back to mount time                  |
| Duration format | `elapsed`, `clock`                        | Compact units or stopwatch notation                  | Always       | `elapsed`                                                                      | `component:Timer` | Stable    | Types reject other values; runtime falls back to `elapsed` |
| Typography      | `type`, `size`, `color`, `weight`         | Same Text-backed surface and resolution as Timestamp | Always       | Timestamp defaults: supporting type, secondary color, type-derived size/weight | Timestamp/Text    | Stable    | Existing Text type behavior                                |
| Time surface    | `<time>` with visible text and `dateTime` | Semantic elapsed duration and time-element props/ref | Always       | Selected format's zero value and `PT0S` before client synchronization          | `component:Timer` | Stable    | Timer-owned `dateTime` wins                                |

## Behavioral and layout contract

| ID   | Candidate invariant                                                                                                                                                                                                                                                                | Basis                        | Draft review state |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------ |
| FR1  | Timer MUST render one `<time>` element with selected-format text and matching non-negative ISO 8601 duration.                                                                                                                                                                      | `spec:AST-037` FR1, FR3, FR5 | Settled            |
| FR2  | Omitted or non-finite `startTime` MUST use the mount origin; a finite value MUST use that caller origin.                                                                                                                                                                           | `spec:AST-037` FR2           | Settled            |
| FR3  | Ticks MUST recompute from the clock and origin, directly update the owned node, and produce zero React update commits.                                                                                                                                                             | `spec:AST-037` FR3–FR4       | Settled            |
| FR4  | Prop changes MUST take effect without remounting or duplicate resources; every setup MUST clean up its resource.                                                                                                                                                                   | `spec:AST-037` FR6–FR7       | Settled            |
| FR5  | `type`, `size`, `color`, `weight`, `xstyle`, `className`, and `style` MUST resolve on the Text wrapper exactly as Timestamp does; other admitted DOM, data, ARIA, and event props and the ref MUST reach `<time>`.                                                                 | `spec:AST-037` FR8           | Settled            |
| FR6  | Timer MUST NOT add live-region semantics by default.                                                                                                                                                                                                                               | `spec:AST-037` FR9           | Settled            |
| FR7  | The Text wrapper MUST carry exactly the `timer` target for this component.                                                                                                                                                                                                         | `spec:AST-037` FR10          | Settled            |
| FR8  | Initial markup MUST use the selected format's zero value and `PT0S` without exposing a clock read in rendered markup.                                                                                                                                                              | `spec:AST-037` FR11          | Settled            |
| FR9  | `elapsed` and `clock` MUST update on second boundaries below one hour; `elapsed` MUST update on minute boundaries at or above one hour while `clock` remains second-precise. A future origin MUST schedule toward its first visible change rather than waking each second at zero. | `spec:AST-037` FR12          | Settled            |
| FR10 | Timer SHOULD skip DOM writes while the represented text and duration are unchanged.                                                                                                                                                                                                | `spec:AST-037` FR13          | Settled            |

### Allowed variation

- **AV1 — Scheduling mechanism.** The private browser scheduling mechanism may
  change while format-aware cadence, clock derivation, no-render ticks, and
  complete cleanup remain true.
- **AV2 — Composition.** Callers may use the supported typography and styling
  inputs without changing timing behavior.

### Representative states

| State            | Required invariant                                             | Allowed variation                       |
| ---------------- | -------------------------------------------------------------- | --------------------------------------- |
| Initial elapsed  | `0s` and `PT0S` on one `<time>`                                | Root props and styling                  |
| Initial clock    | `0:00` and `PT0S` on one `<time>`                              | Root props and styling                  |
| Seconds/minutes  | `34s`, `2m 08s`, `0:34`, or `2:08` with whole-second semantics | Finite elapsed value                    |
| Hour-scale       | `1h 02m` at minute cadence or `1:02:33` at second cadence      | Format                                  |
| Delayed callback | Catch up to clock without accumulated drift                    | Delay length                            |
| Prop update      | New origin or format applies on the same `<time>`              | Parent render cause                     |
| Replay/unmount   | Each acquired resource is released                             | Development replay count                |
| Typography       | Timestamp defaults or explicit Text-family overrides           | Supported type, size, color, and weight |

### Transformation and precedence order

- **ORD1 — Resolve → calculate → clamp → floor to visible precision → format →
  write → schedule next visible boundary.** Apply the pipeline from `spec:AST-037`
  to visible text and machine-readable duration.
- **ORD2 — Timestamp styling split.** Typography, `xstyle`, `className`, `style`,
  and the `timer` target compose on the Text wrapper. Time-element props and the ref
  compose on `<time>`; Timer owns `dateTime`.

### Performance and resources

- **PR1 — No tick renders.** Advancing time produces zero React update commits.
- **PR2 — One resource.** Each mounted Timer owns at most one active timer resource,
  and each setup cleanup releases its resource.
- **PR3 — Visible cadence.** Elapsed output at or above one hour does not wake for
  hidden second changes; clock output remains second-precise.
- **PR4 — Bounded writes.** Unchanged represented text and duration are not rewritten.

## Accessibility contract

- **AR1 — Semantic duration.** The `<time>` element exposes the current non-negative
  ISO 8601 duration at the same precision as its visible output.
- **AR2 — Quiet by default.** No role or `aria-live` value is added automatically;
  deliberate caller ARIA passes through.
- **AR3 — Perceivable text.** The formatted duration remains real text content.

## Design relationships

| Anatomy or state | Design requirement                                                                                                 | Representation authority                   | Hierarchy role | Component contract      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | -------------- | ----------------------- |
| Elapsed time     | One stable inline duration with Timestamp-equivalent supporting typography by default and standard Text overrides. | `spec:AST-037/DEC-1`, `spec:AST-037/DEC-3` | Supporting     | FR1, FR3, FR5, AR1, AR3 |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Elapsed time": {"target": "timer"}
}
```

## Family and system relationships

- Timer and Timestamp are temporal Text-family content components: Timer owns
  durations; Timestamp owns instants. Their typography API and defaults match.
- `spec:AST-037` owns the public behavior, API, accessibility, performance, and
  first-Core-admission decisions projected here.
- `architecture:public-component-api` owns exports, BaseProps, styling, ref, and
  caller-choice rules.
- `architecture:react-component-runtime` owns Effect and resource lifecycle.
- `architecture:component-theming-surface` owns target qualification.

## Verification map

| Contract                    | Verification                                                                     | Representative states                                                                                                        | Mutation or failure expectation                                                                                                                                            | Audit section               |
| --------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| FR1–FR4, FR8–FR10, AR1, AR3 | `Timer.test.tsx` controlled-clock tests                                          | Initial formats, origin variants including future scheduling, delayed callback, format change, second/minute/hour boundaries | State ticks, callback accumulation, wrong ladder/padding, negative values, needless pre-origin wakes, stale semantics, wrong cadence, or clock-derived initial markup fail | `audit:Timer/behavior`      |
| FR3, PR1                    | React Profiler commit-count test                                                 | Several ticks                                                                                                                | A state-based implementation adds update commits and fails                                                                                                                 | `audit:Timer/performance`   |
| FR4, PR2                    | Resource spies under rerender, StrictMode, and unmount                           | Setup, dependency change, replay, cleanup                                                                                    | Duplicate or leaked resources fail counts                                                                                                                                  | `audit:Timer/resources`     |
| FR5                         | Public import, Timestamp-default typography, overrides, BaseProps, and ref tests | Default and explicit typography, ref, event, ARIA, class, style                                                              | Missing export, styling divergence, or dropped input fails                                                                                                                 | `audit:Timer/api`           |
| FR6, AR2                    | Accessibility attribute tests                                                    | Default and deliberate caller ARIA                                                                                           | Unsolicited live semantics or dropped ARIA fails                                                                                                                           | `audit:Timer/accessibility` |
| FR7                         | `themingTargets.test.ts` and `scripts/check-knowledge.mjs`                       | One wrapper target                                                                                                           | Missing, extra, or misplaced target fails                                                                                                                                  | `audit:Timer/theming`       |

## Decision log

No additional decision. This component projects `spec:AST-037` without widening it.

## Open questions

None.

## Content boundary

This file does not duplicate consumer examples, implementation code, private
scheduling mechanics, measurements, or system rules. It links to their owners.
