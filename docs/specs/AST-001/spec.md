---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-001
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-31
phase: accepted
owners: [cixzhang, imdreamrunner]
affects_architecture: [architecture:public-component-api]
affects_families: [family:input-fields]
affects_contributing: []
affects_consumer_docs: [Selector, MultiSelector]
---

# Async option-source states

## Intent

People using Selector or MultiSelector should be able to use every option the
caller has provided, including while the field value is resolving or being
saved. When no option is available, the control should communicate whether the
source is still pending or has completed empty instead of presenting a silent,
actionable-looking selector.

## Non-goals

- Redefining input-family `isLoading`; it remains a value-resolution or saving
  state.
- Choosing the public API name or shape for initial option-source pending state.
- Defining failure, retry, pagination, caching, or stale-response ordering.
- Changing Typeahead's component-owned async search lifecycle.
- Implementing Selector or MultiSelector behavior in this specification pull
  request.

## Requirements

- **FR1 — Provided options determine availability.** The normalized options
  supplied to Selector or MultiSelector are the source of which options can be
  rendered and selected.
- **FR2 — Input loading does not suppress options.** Input `isLoading` MUST NOT
  hide, disable, or otherwise make a provided option unavailable. Search and
  keyboard navigation MUST operate on the same provided option set while the
  field value is busy.
- **FR3 — Zero provided options means no selectable option state.** When the
  normalized provided set contains no selectable option, the selector MUST NOT
  offer activation or navigation that implies a choice is available.
- **FR4 — Initial pending is explicit.** Initial option-source pending state MUST
  be supplied independently. It MUST NOT be inferred from zero options or input
  `isLoading`.
- **FR5 — Pending does not create false empty or read-only claims.** With zero
  provided options, explicit initial pending still has no selectable option, but
  it MUST be presented and announced as loading rather than as completed empty
  or read-only. With provided options, a pending source signal MUST NOT override
  FR1 or FR2.
- **FR6 — Completed empty is read-only and explicit.** With zero provided options
  and no explicit initial pending state, the selector is read-only with no
  selectable option. Its visible and programmatic state MUST communicate that
  completion without requiring a person to activate an unavailable popup.
- **FR7 — Loading, read-only, and empty stay distinguishable.** Visual output,
  accessibility semantics, focus behavior, and announcements MUST agree for:
  initial pending, completed empty, and provided options while input `isLoading`
  is true. A transition from initial pending to completed empty MUST announce the
  new outcome once without losing the control's accessible name or current
  value.

### Platform support

- Supported feature/engine floor: the same browser and assistive-technology
  support as Selector and MultiSelector.
- Unsupported behavior: input `isLoading` MUST NOT be used as a fallback
  option-source signal.
- Browser evidence: the loading, read-only, and completed-empty states require
  real-browser keyboard and accessibility-tree verification; DOM assertions alone
  are not sufficient. Screen-reader observation is recommended follow-up under
  `spec:AST-009`, not a merge or release requirement.

## Current-state impact

- Selector and MultiSelector already keep non-empty provided options rendered,
  keyboard-reachable, and selectable while input `isLoading` is true. That
  satisfies FR1 and FR2; implementation MUST preserve it.
- Input `isLoading` currently suppresses empty and no-results presentation and
  search result-count announcements. Source comments and consumer API text
  describe that suppression as meaning options have not arrived, although the
  flag owns value resolution or saving.
- Neither component exposes explicit initial option-source pending state. With
  zero options and no input loading, each still offers an actionable trigger that
  opens completed-empty content rather than a read-only no-choice state.
- `family:input-fields/FR5` and `family:input-fields/DEC-2` already record the
  approved meaning of input `isLoading`. This spec narrows the resulting
  zero-option, pending, and accessibility requirements for selectors.
- `architecture:public-component-api` and `spec:AST-002` govern the unresolved
  public API needed to represent explicit initial pending state.
- Implementation targets the pending API, zero-option read-only behavior, and
  accessible state transitions. It also removes incorrect option-nonarrival
  claims while preserving populated-option availability. The owning component
  contracts and consumer docs must then link the applicable AST-001 decisions;
  until that lands, `component:Selector` remains the source of truth for shipped
  Selector behavior.

## Verification

| Contract      | Verification                                                                            | Representative states                                                                                  | Mutation or failure expectation                                                                                                |
| ------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| FR1, FR2      | Selector and MultiSelector interaction tests                                            | populated options with input `isLoading`; searched and unsearched; pointer and keyboard                | A provided option disappears, becomes unreachable, or cannot be selected because the field value is busy                       |
| FR3, FR5, FR6 | State-transition and activation tests                                                   | zero options while initial pending; pending to completed empty; zero options without pending           | The control offers a nonexistent choice, claims completed empty while pending, or keeps presenting loading after completion    |
| FR7           | Real-browser keyboard and accessibility-tree tests; screen-reader follow-up recommended | initial pending, completed empty/read-only, populated while input `isLoading`, existing selected value | Visible and announced states disagree, focus is lost, name/value disappears, or a transition is silent or announced repeatedly |
| Public API    | Type-level and consumer-example tests after OQ1 is resolved                             | omitted/default state, explicit initial pending, dynamic completion                                    | Zero options or input `isLoading` silently substitutes for the explicit source state                                           |

## Decision log

### DEC-1 — Provided options stay available while the input value is loading

**Reference:** `spec:AST-001/DEC-1`
**Decider:** `cixzhang`, `2026-08-31`

Selector and MultiSelector derive option availability from the options the caller
provides. Input `isLoading` describes value resolution or saving and does not
suppress those options.

Rejected: treating input `isLoading` as evidence that independently supplied
options have not arrived, because it makes valid choices unavailable and combines
two unrelated states.

### DEC-2 — Zero options is a no-choice state, not evidence of pending work

**Reference:** `spec:AST-001/DEC-2`
**Decider:** `cixzhang`, `2026-08-31`

Zero provided options means there is no selectable option and, once the source is
not explicitly pending, the selector is read-only and communicates completed
empty. Initial pending is a separate explicit state: it has no selectable option
but communicates loading and MUST NOT be inferred from the empty array.

Rejected: using one zero-option observation to mean both “still loading” and
“completed with no choices,” because people and assistive technology could not
distinguish waiting from a finished read-only control.

## Open questions

- **OQ1 — What public API represents explicit initial option-source pending for
  Selector and MultiSelector?** (`human-api`) The API must distinguish pending
  from completed empty without changing input `isLoading` or overriding provided
  option availability.
