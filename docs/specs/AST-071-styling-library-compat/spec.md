---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-071
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-11
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:public-component-api]
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# Styling-library compatibility system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/core/src/**",
    "packages/lab/src/**",
    "packages/charts/src/**",
    "packages/richtext/src/**",
    "packages/vega/src/**"
  ]
}
```

## Intent

A product styles Astryx components with whatever its codebase already uses:
StyleX, class-name CSS (CSS modules, utility classes, global stylesheets), or
inline styles. Every styling input a component accepts reaches its element from
each of those systems, so no part of a component can be styled from StyleX
alone.

## Non-goals

- Whether a component exposes styling for a part at all. A part input is a new
  public prop and is admitted under `spec:AST-002/DEC-1`; this spec shapes a
  part input once it is admitted.
- The order in which styling inputs compose on one element, owned by
  `architecture:public-component-api` INV6.
- Theme tokens and theme targets, owned by `architecture:theme-tokens` and the
  theming records.
- Equivalent internal implementations remain valid when they satisfy this contract.

## Requirements

- **FR1 — A part's styling inputs come as a set.** A component that accepts a
  styling input for an element other than its root MUST accept all three of
  `<part>Xstyle`, `<part>ClassName`, and `<part>Style` for that element, with
  the same `<part>` word in each. All three MUST reach the same element and
  compose there as the root's `xstyle`, `className`, and `style` do.
- **FR2 — No StyleX-only styling input.** A public prop that styles an element
  MUST NOT accept StyleX styles unless the same element also accepts a class
  name and inline styles through public props.

### Platform support

- Supported feature/engine floor: unchanged; this contract adds no CSS feature.
- Unsupported behavior: none; class names and inline styles work in every
  supported engine.
- Browser evidence: not required; FR1 and FR2 are proven at the declaration and
  render layer.

## Current-state impact

- `architecture:public-component-api` gains an invariant that a part's styling
  inputs come as a set, decided by `spec:AST-071/DEC-1`.
- Released public props that do not conform to FR1 and FR2 are
  `ComplexSelector.contentXstyle`, `ContextMenu.triggerXstyle`, and
  `BaseTypeahead.inputXStyle`. They are known gaps, not precedent: no new part
  input is admitted by citing them.

## Verification

| Contract | Verification                                                                     | Representative states                                     | Mutation or failure expectation                                                               |
| -------- | -------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| FR1      | Public-API review of the generated declaration inventory; component render tests | A part input styled from StyleX, a class name, and inline | A `<part>Xstyle` without `<part>ClassName` and `<part>Style`, or one landing elsewhere, fails |
| FR2      | Public-API review of every exported prop typed with StyleX styles                | Root and part inputs across exported components           | A StyleX-typed prop with no class-name and inline-style counterpart on its element fails      |

Known verification gap: no automated check enforces FR1 or FR2; public-API
review applies them.

## Decision log

### DEC-1 — Every styling input works from every styling system

**Reference:** `spec:AST-071/DEC-1`
**Decider:** `cixzhang`, 2026-10-09

Astryx is adopted by products that do not use StyleX. A part reachable only
through `xstyle` leaves a codebase that styles with class names or inline styles
no way to reach that part, and each such prop is the precedent the next part
copies. So a part's styling input is the full set the root already takes, or it
is not admitted.

Rejected: admitting a part `xstyle` alone and adding its counterparts on request — non-StyleX callers stay locked out until someone asks.

## Open questions

- **OQ1 — How the known non-conforming props reach conformance** (`human-api`):
  `ComplexSelector.contentXstyle`, `ContextMenu.triggerXstyle`, and
  `BaseTypeahead.inputXStyle`.
