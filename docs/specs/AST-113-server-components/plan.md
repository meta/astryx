---
schema_version: 1
template_version: 1
kind: implementation-plan
id: plan:AST-113
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
spec: spec:AST-113
owners: [cixzhang]
---

# React Server Components implementation plan

## Phases

### Phase 1 — Text and Heading render on the server

- [ ] Text and Heading become server modules; truncation with a tooltip
      becomes their client part.
- [ ] Server render tests, the DOM-parity check, the hydration test, the
      first-frame visual check, and the bundle check cover both components.

### Phase 2 — Kbd and the next family

- [ ] Kbd gains its server build once `spec:AST-113` OQ3 has an answer.
- [ ] The family `spec:AST-113` OQ1 selects gains its server build, its
      `react-server` entry, and its client parts, with the pre-hydration
      behavior test for its links, disabled states, and groups.

## Verification

| Phase | Contract                                | Evidence                                                                                                    |
| ----- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1     | `spec:AST-113/FR1`, `spec:AST-113/FR10` | Server render tests; a server page bundle with zero Astryx client JavaScript                                |
| 1     | `spec:AST-113/FR6`, `spec:AST-113/FR13` | Static markup parity; the hydration test; the first-frame check on a touch phone and a desktop with a mouse |
| 2     | `spec:AST-113/FR2`, `spec:AST-113/FR4`  | The import-graph walk of the new server entry; the `exports` map condition check                            |
| 2     | `spec:AST-113/FR12`                     | The pre-hydration behavior test with JavaScript off                                                         |

## Status

- Current phase: 1
- Blockers: none
- Inventory: twelve Core components paint a false or empty first state that
  hydration corrects (AppShell, DateInput, TimeInput, DateTimeInput,
  PowerSearch, Tokenizer, OverflowList, Carousel, CommandPalette, Stepper,
  Timer, and ChatLayout). Each needs a change in its own record before it is a
  server-build candidate.
