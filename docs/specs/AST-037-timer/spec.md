---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-037
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-22
phase: accepted
owners: [cixzhang]
affects_architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:react-component-runtime,
  ]
affects_families: []
affects_contributing: []
affects_consumer_docs: [Timer]
---

# Non-rendering elapsed Timer system spec

## Contract at a glance

| Area                                                                                                                     | Contract                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract                                                                                                          | Add `Timer`, `TimerProps`, `TimerFormat`, optional `startTime` in Unix milliseconds, closed `format` values `elapsed` and `clock`, Timestamp-equivalent `type`, `size`,                                                                                                                                                         |
| `color`, and `weight` typography, the root `HTMLTimeElement` ref, and the standard `BaseProps<HTMLTimeElement>` surface. |
| Behavior                                                                                                                 | Render a standardized elapsed duration from the chosen origin, update the owned `<time>` node without React tick renders, and schedule only when the selected format can visibly change.                                                                                                                                        |
| End-user impact                                                                                                          | People watching active work see a stable duration that scales from seconds through minutes and hours without unnecessary timer work competing with the surrounding interface.                                                                                                                                                   |
| Builder impact                                                                                                           | Builders use the zero-config elapsed format, supply an earlier operation start, or choose the standardized stopwatch-like clock format. They use the same                                                                                                                                                                       |
| optional typography props and defaults as Timestamp, and do not write duration                                           |
| formatters or choose timer cadence.                                                                                      |
| Compatibility                                                                                                            | Additive, not yet released. Runtime, accessibility, documentation, and theming evidence must land before release.                                                                                                                                                                                                               |
| Review checks                                                                                                            | Reject custom formatter or cadence APIs, React state updates for ticks, callback-count drift, one-second wakeups after elapsed output drops seconds, leaked timers, negative output, lost root passthrough/ref behavior, or more than one visible anatomy part.                                                                 |
| Governing rules                                                                                                          | [`architecture:public-component-api`](../../architecture/public-component-api.md); [`architecture:react-component-runtime`](../../architecture/react-component-runtime.md); [`architecture:component-theming-surface`](../../architecture/component-theming-surface.md); [AST-002 DEC-1, DEC-2, and DEC-5](../AST-002/spec.md). |

This table is a review projection; the body below is authoritative.

## Intent

Products need a shared elapsed-time primitive for operations whose duration
changes while visible. Its defining value is ownership of a clock-driven DOM
update that does not schedule a React render on each tick. Its formatting remains
consistent as a duration grows from seconds through minutes and hours, and its
resource cadence follows the precision a person can actually see.

Timer is distinct from Timestamp: Timestamp describes an instant and may present
relative calendar language, while Timer measures duration from an origin. It is
also distinct from Text: Text presents caller-owned content, while Timer owns the
changing duration value, standardized representation, and resource lifecycle.

### Component ledger

| Source requirement                                                                                         | Proposed target                | Why it belongs                                                                                                                                                                     | Done criteria                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Show elapsed time during active work without periodic React render work or product-local formatting drift. | Stable Core `Timer` component. | The behavior repeats across loading, processing, recording, and activity surfaces; products should not rebuild formatting, lifecycle, drift handling, or cadence at each callsite. | Closed formats, format-aware scheduling, direct owned-node updates, clock-derived duration, cleanup, ref and passthrough behavior, theming target, consumer docs, stories, and focused tests conform to this contract. |

## Ownership boundary

AST-037 owns Timer's public elapsed-origin and format concepts, representation
ladder, format-aware cadence, non-rendering tick requirement, semantic duration
output, resource lifecycle, and initial Core admission. The Timer component record
owns the concrete component projection and evidence after implementation.
`architecture:public-component-api` owns export, BaseProps, styling, ref, and
caller-choice rules. `architecture:react-component-runtime` owns Effect and
resource lifecycle correctness. `architecture:component-theming-surface` owns
target qualification.

## Non-goals

- Loading indicators, waiting messages, status labels, or when a product chooses to
  show or hide elapsed time.
- Wall-clock dates, relative calendar phrases, time zones, or absolute instants.
- Pause, resume, deadlines, alarms, lap history, or imperative timer controls.
- Countdown is deferred to a later contract; standardized duration formats and
  cadence remain reusable if Timer later admits an end-time origin.
- Sub-second display precision, arbitrary formatter callbacks, or caller control of
  the internal scheduling cadence.
- Announcing every tick to assistive technology.
- A new global token or component-specific theme variable.

## Public concepts

| Concept           | Closed values or states                     | Meaning                                                                       | Default                                                          | Invalid-value behavior                                     |
| ----------------- | ------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Elapsed origin    | Mount time or `startTime` Unix milliseconds | The instant from which elapsed duration is derived                            | Mount time                                                       | A non-finite value falls back to mount time                |
| Duration format   | `elapsed`, `clock`                          | Standardized visible representation and its implied precision                 | `elapsed`                                                        | Types reject other values; runtime falls back to `elapsed` |
| Tick presentation | Current elapsed value on one `<time>` root  | Visible text and machine-readable duration at the selected format's precision | `0s` for elapsed; `0:00` for clock before client synchronization | Clock values before the origin clamp to zero               |

`startTime` is caller-owned because Timer cannot derive when an operation began
before Timer mounted. `format` is caller-owned because compact prose and a
stopwatch readout are distinct presentation needs. Formatting details and
scheduling cadence remain Timer-owned: callers choose meaning, not machinery.

## Standard formats

| Elapsed duration              | `elapsed` | `clock`   |
| ----------------------------- | --------- | --------- |
| zero                          | `0s`      | `0:00`    |
| 34 seconds                    | `34s`     | `0:34`    |
| 2 minutes, 8 seconds          | `2m 08s`  | `2:08`    |
| 1 hour, 2 minutes, 33 seconds | `1h 02m`  | `1:02:33` |

`elapsed` displays at most two units, largest first. Seconds are unpadded when
they are the only unit, padded after minutes, and omitted after hours. `clock`
uses colon-separated stopwatch notation: `m:ss` below one hour and `h:mm:ss`
from one hour onward.

## Requirements

- **FR1 — One semantic root.** Timer MUST render one `<time>` root whose visible
  text uses the selected standard format.
- **FR2 — Derivable origin default.** With no `startTime`, elapsed time MUST begin
  from the component's mount lifetime. With a finite `startTime`, elapsed time MUST
  derive from that Unix-millisecond origin.
- **FR3 — Clock-derived, non-negative duration.** Timer MUST subtract the resolved
  origin from the current clock, clamp negative duration to zero, and derive output
  from that result. It MUST NOT accumulate elapsed time from callback count, so a
  delayed callback catches up without cumulative drift.
- **FR4 — No tick renders.** Clock ticks MUST update the owned `<time>` node
  directly and MUST produce zero React update commits for Timer and its surrounding
  subtree. Parent renders caused by unrelated work remain outside Timer's control.
- **FR5 — Machine-readable parity.** Timer MUST update `dateTime` to an ISO 8601
  duration representing the same precision as the visible value: whole seconds for
  `clock` and for `elapsed` below one hour, whole minutes for `elapsed` at or above
  one hour.
- **FR6 — Current props without duplicate resources.** A changed `startTime` or
  `format` MUST take effect without remounting and without creating more than one
  active timer resource.
- **FR7 — Complete lifecycle ownership.** Each mounted Timer owns at most one active
  browser timer resource. Every Effect setup MUST release the resource it acquired
  during dependency change, node replacement, unmount, and StrictMode replay. No
  tick may update a detached or replaced node.
- **FR8 — Stable public DOM and typography surface.** The root MUST expose
  `Timer`, `TimerProps`, `TimerFormat`, its `HTMLTimeElement` ref, Text-family
  `type`, `size`, `color`, and `weight`, and the standard DOM, data, ARIA, style,
  class, event, and `xstyle` inputs admitted by `BaseProps<HTMLTimeElement>`.
  Typography resolution and defaults MUST match Timestamp: `type="supporting"`,
  `size="supporting"`, `color="secondary"`, and `weight="normal"`.
- **FR9 — No unsolicited live announcements.** Timer MUST NOT add a live-region
  role or `aria-live` value by default. A caller may deliberately provide an ARIA
  attribute through the standard DOM surface for a context that needs it.
- **FR10 — One themeable anatomy part.** The visible root MUST carry the `timer`
  theming target. No subpart, format, timing state, or scheduling mechanism receives
  a separate target.
- **FR11 — Initial render is deterministic.** Initial markup MUST show the selected
  format's zero value with `dateTime="PT0S"` without reading the client clock into
  server-visible markup. Client synchronization then applies the chosen origin.
- **FR12 — Format-aware cadence.** `clock` and `elapsed` below one hour MUST schedule
  at the next whole-second boundary. `elapsed` at or above one hour MUST schedule at
  the next whole-minute boundary because its visible output omits seconds. A future
  origin MUST schedule directly toward the first visible change rather than waking
  every second while output remains zero. A callback that runs late MUST schedule
  from the current clock, not from the missed deadline.
- **FR13 — Bounded DOM writes.** Timer SHOULD skip visible-text and `dateTime` writes
  when the selected format's represented value has not changed.

### Transformation and precedence

Resolve the finite caller origin or mount origin, subtract it from the current
clock, clamp to zero, floor to the selected format's current precision, format the
value, update visible and machine-readable output on the same owned node, then
schedule the next boundary where that format can change. Timer owns `dateTime`;
standard consumer attributes and styling otherwise reach the root.

### Platform support

- Supported feature/engine floor: unchanged from the current Core package support.
- Unsupported behavior: environments without Effects retain the selected format's
  deterministic zero value and `PT0S`, and acquire no timer resource.
- Browser evidence: real-browser stories verify both format ladders, the hour
  boundary, stable inline geometry, semantic duration parity, and absence of
  component update commits.

## Current-state impact

- Core gains one stable elapsed-duration component and type, two closed formats,
  Timestamp-equivalent typography props, one `timer` theming target, consumer
  documentation, Storybook coverage, and a showcase block.
- Timestamp remains unchanged and continues to own instants, calendar-relative
  language, time zones, and absolute formatting.
- The default path adds no builder choice. Only operations that began before mount
  supply `startTime`; only stopwatch-like surfaces choose `format="clock"`.
- Custom formatting and timer cadence are intentionally not public API.
- No existing component, export, DOM structure, theme, token, or callsite changes.

## Verification

| Contract           | Verification                                                                    | Representative states                                                                                                                             | Mutation or failure expectation                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1–FR5, FR11–FR13 | Focused Timer tests with a controlled clock and fake timers                     | Initial, default/earlier/future origin and future scheduling, delayed callback, each format ladder, 59:59→1:00:00 boundary, elapsed hour boundary | State-driven ticks, callback-count accumulation, negative values, needless pre-origin wakes, wrong padding/unit ladder, stale `dateTime`, wrong initial markup, redundant writes, or one-second post-hour elapsed wakeups fail |
| FR4                | React Profiler commit-count test                                                | Several elapsed ticks and a composed sibling                                                                                                      | Replacing owned-node mutation with React state produces extra update commits                                                                                                                                                   |
| FR6–FR7            | Resource spy tests under rerender, unmount, and StrictMode                      | Origin change, format change, replay, cleanup                                                                                                     | Duplicate or leaked timer resources fail setup/cleanup counts and detached-node guards                                                                                                                                         |
| FR8                | Public import, DOM passthrough, typography, styling merge, event, and ref tests | Root import, Timestamp defaults, each typography override, and representative BaseProps                                                           | Missing exports; divergent defaults; or dropped typography, attributes, handlers, class/style inputs, or root ref fail                                                                                                         |
| FR9                | Accessibility attribute tests                                                   | Default and caller-declared live behavior                                                                                                         | Timer adds unsolicited live semantics or drops deliberate caller ARIA                                                                                                                                                          |
| FR10               | Theming-target and knowledge checks                                             | One root target across formats                                                                                                                    | Missing, extra, or misplaced target mapping fails repository validation                                                                                                                                                        |
| Browser contract   | Storybook browser evidence                                                      | Default elapsed, clock, earlier origin, hour-scale elapsed, composed wait message                                                                 | Visible output, semantic duration, geometry, or update-commit behavior differs from the contract                                                                                                                               |

## Decision log

### DEC-1 — Timer owns non-rendering elapsed-time updates

**Reference:** `spec:AST-037/DEC-1`  
**Direction owner:** `cixzhang`, `2026-09-22`

Timer is a stable shared primitive for elapsed time. It owns one clock-derived
duration and writes changing text directly to its owned DOM node so clock ticks do
not schedule React renders. Builders may supply an earlier start instant or choose
a standardized format; they do not supply a formatter or control scheduling.

Rejected: implementing each tick through React state. That makes every Timer a
periodic render source and increases contention in trees already processing live
application updates.

Rejected: exposing an interval, tick frequency, or arbitrary formatter. Those
choices prevent the component from maintaining consistent duration language and
from reducing work when visible precision drops.

### DEC-2 — Timer starts in Core

**Reference:** `spec:AST-037/DEC-2`  
**Direction owner:** `cixzhang`, `2026-09-22`

Timer starts in Core because its purpose is a stable cross-product runtime
primitive, its first contract is intentionally narrow, and the requested behavior
is already operationally proven. Core admission requires the complete evidence in
this spec before release; it does not waive normal component quality gates.

Rejected: shipping independent product copies or making the non-rendering behavior
an application recipe. That would duplicate representation, resource ownership,
and cadence decisions across callsites.

### DEC-3 — Formats own their visible precision and cadence

**Reference:** `spec:AST-037/DEC-3`
**Direction owner:** `cixzhang`, `2026-09-22`

Timer exposes two standard representations: `elapsed` for compact prose and row
metadata, and `clock` for stopwatch-like readings. Each format owns its precision,
so the runtime wakes only at the next boundary capable of changing visible output.
In particular, elapsed durations at or above one hour omit seconds and wake on
minute boundaries.

Rejected: scaling cadence from elapsed age while continuing to display seconds.
That would leave visible output stale. Precision changes first; cadence follows it.

## Open questions

None. The contract is current; implementation evidence remains pending.

## Content boundary

This record does not duplicate consumer examples, implementation code, private
scheduling mechanics, current measurements, or system runtime/theming rules. Those
belong to their canonical owners.
