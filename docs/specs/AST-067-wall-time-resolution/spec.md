---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-067
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-14
phase: accepted
owners: [cixzhang]
affects_architecture: []
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# Wall-clock time resolution system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/core/src/utils/plainDate.ts",
    "packages/lab/src/Schedule/**"
  ]
}
```

## Intent

People who see dates and times in a chosen time zone, such as a Schedule week or
day, get instants on the dates they asked for, including on days when daylight
saving or another offset change skips or repeats an hour. Core turns a calendar
date and a wall-clock time in a named time zone into one instant by the rules of
Temporal's default `"compatible"` disambiguation, so Astryx and code that uses
Temporal agree on every instant.

## Non-goals

- Choosing or detecting a time zone, and formatting instants for display.
- Calendars other than the Gregorian calendar, and date arithmetic that never
  involves a time zone.
- Offering the other Temporal disambiguation modes (`"earlier"`, `"later"`,
  `"reject"`) as options.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — One instant for every date and wall-clock time.**
  `plainDateToInstant(date, timezoneID, hour, minute)` from
  `@astryxdesign/core/utils` MUST return exactly one instant for every valid
  date, wall-clock time, and IANA time zone, including wall times that an offset
  change skips or repeats. `hour` and `minute` default to 0.
- **FR2 — A skipped wall time resolves forward.** When an offset change skips
  the wall time, the result MUST be that wall time read in the offset in effect
  before the change, which is the same wall time moved forward by the length of
  the gap: 2:30 AM on a day that jumps from 2:00 to 3:00 AM resolves to 3:30 AM.
- **FR3 — A repeated wall time resolves to its earlier occurrence.** When an
  offset change repeats the wall time, the result MUST be its first occurrence,
  read in the offset in effect before the change, in zones with negative and
  positive offsets alike.
- **FR4 — The start of a day falls on that day.** With the default time, the result is FR2's or FR3's resolution of midnight. When the zone observes midnight, or its offset change begins at midnight, that is the first instant of that date: read back in the zone it is the same date, and the instant one millisecond earlier is the previous date. A date the zone skips entirely resolves to the first instant after the gap, on the next date.

### Platform support

- Supported feature/engine floor: every engine Astryx supports; time-zone rules
  come from the engine's `Intl` time-zone data.
- Unsupported behavior: time-zone identifiers the engine's `Intl` does not
  recognize.
- Browser evidence: not required. The requirements are about instants and are
  proven by utility tests against named zones; components that paint ranges
  keep the browser evidence their own records require.

## Current-state impact

- `plainDateToInstant` in `@astryxdesign/core/utils` is the governed API.
- Lab `Schedule` turns the days of its week and day ranges into instants through it; `component:Schedule` keeps ownership of how a range is chosen and laid out.
- `architecture:public-component-api` continues to own the utility's export and
  compatibility.

## Verification

| Contract | Verification                                        | Representative states                                                                                                                                                                                      | Mutation or failure expectation                                                                                       |
| -------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| FR1–FR3  | `plainDate.test.ts`                                 | Midnight skipped from a negative offset (America/Santiago, America/Havana); a 2:30 AM gap (America/Los_Angeles); a 30-minute gap (Australia/Lord_Howe); repeated hours in America/Havana and Europe/Berlin | Resolving a gap backward, or a repeated wall time to its later occurrence, fails the instant assertions.              |
| FR4      | `plainDate.test.ts` and Schedule week and day tests | The Santiago and Havana transition weeks and days, including a week and a day that end at the skipped midnight; a date Pacific/Apia skips (2011-12-30)                                                     | A start-of-day instant on the previous date fails the date round trip and the column count of the week and day views. |

## Decision log

### DEC-1 — Core follows Temporal's "compatible" disambiguation

**Reference:** `spec:AST-067/DEC-1`
**Decider:** `cixzhang`, 2026-10-14

A wall time that an offset change skips or repeats needs exactly one answer, and
Astryx and product code that uses Temporal or the `Date` constructor must give
the same one; otherwise a range computed in one and read in the other lands on a
different day. Temporal's default `"compatible"` mode is that answer. The rule
belongs to Core because every utility and component that turns dates into
instants depends on it, not only Schedule.

Rejected: correcting the skipped-midnight case inside Lab Schedule alone, which
leaves Core's utility returning an instant on the previous day for every other
caller.

## Open questions

None.
