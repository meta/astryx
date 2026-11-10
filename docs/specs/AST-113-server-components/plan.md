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

### Phase 1 — Text, Heading, and Kbd render on the server

- [ ] Text, Heading, and Kbd become server modules; truncation with a tooltip
      and the platform `mod` glyph become client parts.
- [ ] Server render tests, the DOM-parity check, and the bundle check cover
      the three components.

### Phase 2 — The next family

- [ ] The family `spec:AST-113` OQ1 selects gains its server build, its
      `react-server` entry, and its client parts.

## Verification

| Phase | Contract                                | Evidence                                                                         |
| ----- | --------------------------------------- | -------------------------------------------------------------------------------- |
| 1     | `spec:AST-113/FR1`, `spec:AST-113/FR10` | Server render tests; a server page bundle with zero Astryx client JavaScript     |
| 1     | `spec:AST-113/FR6`                      | Static markup parity between the server and client renders                       |
| 2     | `spec:AST-113/FR2`, `spec:AST-113/FR4`  | The import-graph walk of the new server entry; the `exports` map condition check |

## Status

- Current phase: 1
- Blockers: none
