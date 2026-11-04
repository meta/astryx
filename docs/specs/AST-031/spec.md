---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-031
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [josephfarina, cixzhang]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: []
affects_consumer_docs: [authoring]
---

# Runtime integration feature composition system spec

## Intent

Define reusable composition rules for runtime integration features — CLI
capabilities that an integration can contribute alongside its default manifest.
Each feature is a named export from the integration module and an optional
matching field in `astryx.config`. Multiple handlers compose additively: every
configured eligible handler runs in isolation, failures are reported per handler, and
the feature defines one aggregate command outcome without letting one handler
silence the others.

This spec captures the general composition contract first, then records the
requirements specific to `gapReport`, the first feature built on it.

## Non-goals

- Replace the default-export manifest or its contribution model (components,
  templates, codemods, docs). Those are loaded by the `Project` seam and are
  outside this scope.
- Define transport protocols, network destinations, or persistence formats for
  any handler.
- Provide a plugin system with lifecycle hooks, dependency ordering, or
  inter-handler communication.

---

## Requirements

### General composition rules

The following rules apply to every runtime integration feature that follows
this spec. A feature is identified by a named export from
`astryx.integration.{ts,mjs,js}` and optionally a matching field in
`astryx.config`.

#### Named export + matching project config field

A feature is declared as a **named export** from the integration module.
The same feature may also appear as a field in the consumer's
`astryx.config` for project-level handlers. Older CLI versions that do not
recognize the named export ignore it and continue loading the default manifest.

#### Additive composition

Every handler in the effective set receives an ordered delivery outcome. The
project handler comes first, then each integration handler in the order the
integrations appear in `astryx.config`. An eligible handler runs; a public
handler without consent records `consent_required` without being called. No
handler overrides or displaces another.

#### Identity dedupe by handle function

When the same `handle` function reference appears more than once in the
effective set (e.g. a project config re-exports an integration's handler), it
runs exactly once, at the position of its first occurrence.

#### Per-handler structuredClone copy

Each handler receives its own `structuredClone` copy of the event. A handler
that mutates its input cannot affect any other handler.

#### Failure isolation + aggregate response

A handler that throws, times out, or misbehaves produces a failed delivery for
that handler. Later handlers still run. The command's aggregate response
collects a per-handler delivery record so the caller can see exactly which
handlers succeeded, which failed, and why.

#### Lifecycle / async

- **Timeout:** each handler has a 30-second wall-clock timeout and receives an
  `AbortSignal` that fires when that budget expires.
- **Async:** handlers may be async; the CLI awaits each one.
- **Execution order:** handlers run sequentially in effective-set order. A
  handler's failure does not skip subsequent handlers.

#### Per-handler consent metadata

Each handler declares an `audience` of `'internal'` or `'public'`. The CLI
enforces consent per handler: a `public`-audience handler is not invoked
unless the caller has explicitly confirmed the public write. An `internal`
handler requires no additional confirmation.

#### Inspectable consent (consent_required delivery)

When the caller has not confirmed consent and a handler requires it, the CLI
records a `consent_required` delivery for that handler without calling it. The
caller can inspect which handlers would need consent before re-running with
confirmation.

#### Fallback behavior

A built-in fallback (e.g. opening a GitHub issue via `issuesUrl`) activates
**only** when the effective handler set is empty after deduplication. The
presence of any configured handler — project or integration — suppresses the
fallback entirely.

#### issuesUrl is target metadata

`issuesUrl` on an integration manifest or project config describes the
destination for human-readable issue links. It is metadata about the target
package, not a handler implementation. Handlers use it as context; the CLI
uses it for fallback routing.

#### Mutation-sensitive tests

Tests for a feature built on this composition model MUST cover the fan-out
order, isolation, deduplication, timeout, consent gating, consent-required
inspection, fallback suppression, and aggregate response shape. Removing a
fail-closed guard MUST break a test.

---

### Gap-report-specific requirements

`gapReport` is the first feature built on the general composition rules above.

- **FR1 — Handler type.** A gap-report handler is a plain object conforming to
  `GapReportHandler`: `{ audience: 'internal' | 'public', handle: (event: GapReport, context: { signal: AbortSignal }) => GapReportHandlerReceipt | Promise<GapReportHandlerReceipt> }`.
  `GapReportHandler` replaces `GapReportWriter`.

- **FR2 — Event shape.** The `GapReport` event carries `schemaVersion: 1`,
  plain camelCase field names, normalized values, and a `target` object with
  `{ package, version, issuesUrl }`. No snake_case, no abbreviations, no
  nested debug context.

- **FR3 — Receipt contract.** A handler MUST return a `GapReportHandlerReceipt`:
  `{ status: 'filed' | 'routed_only' | 'skipped', url?: string, message?: string }`.
  No other status values are accepted. `url` and `message` are optional and
  carry human-readable context.

- **FR4 — Handler isolation.** Each handler runs in isolation:
  - Each handler runs in its own worker. `stdout` is redirected to `stderr`, and
    `process.exit`, `process.exitCode`, and late promise continuations are
    contained in that worker.
  - A throw or timeout (30 s) produces a failed delivery for that handler. The
    CLI aborts the handler's signal, then terminates its worker before starting
    the next handler.
  - A failed handler does not affect the command's own exit code or other
    handlers.

- **FR5 — No inherited-handler opt-out.** There is no opt-out mechanism for
  gap-report handlers analogous to `inheritDebug`. Every internal handler in the
  effective set runs, and every public handler receives an outcome subject only
  to the explicit consent gate.
  The `inheritDebug` field in `package.json` is a compatibility exception specific
  to the `debug` feature (see Decision log DEC-2); it does not set a precedent
  for other features.

- **FR6 — Effective set.** The effective handler set is: project config's
  `gapReport` handler first (if present), then each integration's `gapReport`
  named export in `astryx.config` integration order. Deduplication is by
  `handle` function identity.

- **FR7 — Target selection.** The target package for the gap report is selected
  by: explicit `--package` flag → the unique component owner when only one
  package owns the component → Core as the default. Target selection is not
  based on handler count or handler source.

- **FR8 — Built-in GitHub fallback.** When the effective handler set is empty
  (zero handlers after deduplication), and the target has a GitHub `issuesUrl`,
  the CLI offers to file via `gh issue create`. This fallback is consent-gated
  (`public` audience). Any other `issuesUrl` scheme produces a `routed_only`
  receipt. The fallback is suppressed entirely when at least one handler exists.

- **FR9 — Project config field.** `astryx.config` gains a `gapReport` field
  accepting a `GapReportHandler`. This is the project-level handler and runs
  first in the effective set.

- **FR10 — Integration named export.** An integration declares its handler as
  `export const gapReport: GapReportHandler` from its integration module. The
  named export is deliberately not a default-manifest field, consistent with the
  `debug` feature's export convention.

- **FR11 — Per-handler consent.** Each handler's `audience` is evaluated
  independently. A fan-out with mixed audiences invokes `internal` handlers
  unconditionally and gates `public` handlers on caller consent. Ungated
  handlers still run even when a gated sibling is blocked.

- **FR12 — Aggregate response.** The command's response includes a `deliveries`
  array with one entry per effective handler or fallback. Each delivery records
  `handlerType`, `handler`, `audience`, `status`, `url`, and `message`. The
  response shape is the same in `--json` and human output modes.

- **FR13 — A destination the caller names.** When the caller names a
  destination with `--to`, that destination replaces the handlers and the FR8
  fallback for that report. `architecture:cli-surface` INV36 governs the option
  and who chooses the destination.

#### Platform support

- Supported: Node >= 22.13, any OS the CLI supports.
- Unsupported: handlers that depend on network access, native binaries, or
  platform-specific APIs are the handler author's responsibility; the CLI
  provides isolation but not capability detection.

---

## Current-state impact

`debug` already composes one project function with every integration named export,
in project-first/config-order delivery, with identity dedupe and per-handler copies.
Its synchronous process-exit lifecycle and existing `inheritDebug` compatibility
switch remain unchanged.

PR #6200 initially selected one executable gap writer. This specification replaces
that model before release: `gapReport` becomes one project handler plus every loaded
integration handler, and each handler returns its own receipt. Existing consumers
without handlers keep the consent-gated `issuesUrl` fallback. No released config or
integration API requires migration because the single-writer shape has not shipped.

---

## Verification

| Contract | Verification                                           | Representative states                                                                                                      | Mutation or failure expectation                                                                         |
| -------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| FR1–FR3  | gap-report handler type and receipt contract tests     | valid handler; missing audience; wrong status value; non-object return                                                     | an invalid handler shape or receipt is accepted silently                                                |
| FR4      | handler isolation tests                                | handler writes stdout; handler calls process.exit; handler throws; handler exceeds 30 s                                    | stdout corruption reaches the JSON envelope, or exit/throw stops later handlers                         |
| FR5      | no-opt-out assertion test                              | project sets `inheritDebug: false` in package.json; gap-report handlers still run                                          | an opt-out mechanism suppresses a gap-report handler                                                    |
| FR6      | effective-set ordering and deduplication tests         | project + two integrations; duplicate handle ref; project only; integrations only                                          | wrong order, duplicate execution, or missing handler                                                    |
| FR7      | target selection tests                                 | explicit package; unique owner; ambiguous owner requiring `--package`; no component match                                  | handler count influences target, ambiguity is guessed, or an unknown component fails to default to Core |
| FR8      | fallback activation and suppression tests              | zero handlers + GitHub issuesUrl; zero handlers + non-GitHub issuesUrl; one handler present                                | fallback fires with a handler present, or non-GitHub issuesUrl claims it filed                          |
| FR9–FR10 | config field and named-export loading tests            | project config with gapReport; integration with named export; both present; neither present                                | config field ignored, named export ignored, or old CLI breaks on named export                           |
| FR11     | mixed-audience consent tests                           | all internal; all public with consent; all public without consent; mixed with partial consent                              | a public handler runs without consent, or an internal handler is blocked by consent                     |
| FR12     | aggregate response shape tests                         | all succeed; one fails; one times out; consent_required entries; empty set (fallback)                                      | missing delivery entry, wrong source attribution, or response shape differs between --json and human    |
| FR13     | named destination tests                                | `--to` naming an integration with a GitHub issuesUrl, with and without consent; a non-GitHub issuesUrl; an unknown package | a handler runs with `--to`, or an unknown destination sends anything                                    |
| General  | mutation-sensitive composition tests (structuredClone) | handler mutates event fields; handler adds properties to event                                                             | mutation leaks to a subsequent handler                                                                  |

---

## Decision log

### DEC-1 — Handlers compose additively; no single-writer selection

**Reference:** `spec:AST-031/DEC-1`
**Decider:** `josephfarina`, `2026-09-10`

Every configured handler runs. The previous model selected one writer based on
target ownership, which meant an integration could not observe reports about
components it did not own. Additive composition lets every interested party
receive every report while isolating failures to individual deliveries.

Rejected: single-writer selection by target ownership; priority-based override
where a project handler silences integration handlers; "first match wins"
routing.

### DEC-2 — No general opt-out mechanism for runtime features

**Reference:** `spec:AST-031/DEC-2`
**Decider:** `josephfarina`, `2026-09-10`

The `debug` feature's existing `inheritDebug` switch remains a compatibility
exception owned by that feature. It does not establish a general
`inherit<Feature>` convention. Gap reporting is an explicit command whose purpose
is to notify every configured handler, so loading an integration opts into its
handler. Any future opt-out requires a separate owner decision.

Rejected: automatically cloning `inheritDebug` into a general package.json
pattern; adding a gap-report opt-out that silently prevents a loaded integration
from receiving an explicit report.

### DEC-3 — Target selection uses component ownership, not handler count

**Reference:** `spec:AST-031/DEC-3`
**Decider:** `josephfarina`, `2026-09-10`

The target package for a gap report is the package that owns the component. When
multiple packages claim the same component name, the CLI requires an explicit
`--package` instead of guessing. A name with no exact owner defaults to Core.
Handler count and handler order never change target attribution.

Rejected: selecting the target by handler count or integration order; silently
choosing one ambiguous owner; distributing target ownership to every package that
ships a handler.

## Open questions

None.
