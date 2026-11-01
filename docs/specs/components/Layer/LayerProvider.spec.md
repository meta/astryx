---
schema_version: 3
template_version: 7
kind: component
id: component:LayerProvider
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
owners: [cixzhang]
review_triggers: [public-api, behavior, layout]
verified_by:
  [
    packages/core/src/Layer/LayerProvider.test.tsx,
    apps/storybook/stories/Layer.stories.tsx,
  ]
modules: []
families: []
design_specs: []
architecture: [architecture:layer-runtime]
contributing: []
system_specs: [spec:AST-059, spec:AST-038]
---

# LayerProvider component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `LayerProvider` with `children`, `toast` (`{position, maxVisible, inset}`), and `inset` (`{blockStart, blockEnd, inlineStart, inlineEnd}`).                                                                                                |
| Behavior                | The outermost provider supplies layer configuration and mounts the app's one toast viewport around `children`. A nested provider renders its children unchanged, except that a nested `inset` narrows the inset for layers in its subtree. |
| End-user impact         | Toasts appear in one configured corner, and anchored layers and toasts stay clear of a declared floating bar.                                                                                                                              |
| Builder impact          | None.                                                                                                                                                                                                                                      |
| Compatibility/readiness | Records shipped behavior; no public change.                                                                                                                                                                                                |
| Review checks           | Reject a second toast viewport from a nested provider, a provider that hosts trigger-associated layers, or a default provider that renders layers differently from no provider.                                                            |
| Governing rules         | `spec:AST-059` FR6 (the inset); `architecture:layer-runtime` INV10–INV11; `component:Toast`.                                                                                                                                               |

This table is a review projection; the body below is authoritative.

## Intent

LayerProvider is the app-level configuration point for Astryx layers. It is the
only public component `Layer.doc.mjs` documents, as an inline entry; the rest of
that doc describes the layer runtime, which `architecture:layer-runtime` owns.
This record owns what the provider itself renders.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Whether a provider mounts the toast viewport, and what a nested provider
  passes through (FR1–FR3).

**Does not own / non-goals**

- What the inset does to gutters, caps, and the toast viewport — owned by
  `spec:AST-059` FR6.
- Layer hosting, placement, and text defaults — owned by
  `architecture:layer-runtime` and `spec:AST-038`.
- Toast behavior, including how `toast.inset` edges combine with `inset` —
  owned by `component:Toast` (FR6).

## Public concepts

No component-local concept beyond the consumer props.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                     | Basis                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| FR1 | A provider with no LayerProvider above it supplies the layer context (`toast` configuration and `inset`) and wraps `children` in one toast viewport configured by `toast.position`, `toast.maxVisible`, `toast.inset`, and `inset`.                                                                           | Current source and tests           |
| FR2 | A provider nested under another mounts no toast viewport. Without `inset` it renders its children unchanged; with `inset`, each edge it declares applies to the layers in its subtree, and it keeps the outer `toast` configuration. What an edge it leaves unset reads in that subtree is uncontracted here. | Current source; `spec:AST-059` FR6 |
| FR3 | With nothing declared, a provider changes no layer geometry, so layers under a default provider match layers with no provider.                                                                                                                                                                                | `spec:AST-059` FR6; tests          |

### Allowed variation

- **AV1 — Configuration.** The `toast` and `inset` values vary.

### Representative states

| State                | Required invariant                              | Allowed variation |
| -------------------- | ----------------------------------------------- | ----------------- |
| Root provider        | One toast viewport; context supplied.           | Toast config.     |
| Nested without inset | Children unchanged; no second viewport.         | —                 |
| Nested with inset    | Subtree inset narrowed; toast config unchanged. | Inset.            |

### Transformation and precedence order

- **ORD1 — Inset.** For an edge a nested provider declares, its value applies
  in its subtree; unset edges are uncontracted (FR2).

### Performance and resources

- No resource rule.

## Accessibility contract

- No accessibility behavior of its own; the toast viewport's is owned by
  `component:Toast`.

## Design relationships

| Anatomy or state | Design requirement                | Representation authority | Hierarchy role | Component contract |
| ---------------- | --------------------------------- | ------------------------ | -------------- | ------------------ |
| Provider         | Renders no visual surface itself. | Current source           | Supporting     | FR1                |

`Layer.doc.mjs` declares no anatomy, so no anatomy-theming map is recorded.

## Family and system relationships

- `spec:AST-059` FR6 owns the inset's meaning.
- `architecture:layer-runtime` INV10 states that the provider is configuration,
  not a universal layer host.

## Verification map

| Contract | Verification             | Representative states                        | Mutation or failure expectation                                                   | Audit section                  |
| -------- | ------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------ |
| FR1–FR3  | `LayerProvider.test.tsx` | Default, declared inset, nested, toast inset | A default-provider difference, or an inset that does not reach its layers, fails. | `audit:LayerProvider/behavior` |

Read from source, with no focused test yet:

- FR1: `toast.position` and `toast.maxVisible` reaching the viewport.
- FR2: a nested provider without `inset` mounting no second viewport and
  rendering its children unchanged, and the outer `toast` configuration being kept.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, the inset rules, or the
layer runtime. It links to their owners.
