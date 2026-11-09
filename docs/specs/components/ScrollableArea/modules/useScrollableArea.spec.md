---
schema_version: 3
template_version: 1
kind: module
id: module:ScrollableArea/useScrollableArea
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-11
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/core/src/hooks/useScrollableArea.test.tsx,
    packages/core/src/hooks/scrollKeyboardDelegation.test.ts,
    packages/core/src/BottomSheet/__tests__/BottomSheetKeyboard.a11y.browser.spec.ts,
  ]
parent_component: component:ScrollableArea
references: [architecture:public-component-api, spec:AST-025/DEC-1]
---

# useScrollableArea module contract

## Intent

useScrollableArea is the canonical reusable behavior core for components that
already own a viewport and content root. It provides safe prop/ref composition,
logical-axis measurement, live owner registration, edge state, keyboard access,
and scroll chaining without inserting structure.

## Compatibility and migration

- Released default preserved: not yet released
- Compatibility class: additive public hook and types
- Migration decision: `spec:AST-025/DEC-1`

## Ownership boundary

**Owns**

- Effective-axis measurement and stable logical-edge state.
- Observation, invalidation, DOM owner registration, conditional viewport access,
  and effective-axis chaining.
- Safe composition of caller viewport/content props and refs.

**Does not own / non-goals**

- Viewport layout, paint, overflow declarations, scrollbar presentation, or
  insertion of a content wrapper.
- Sticky positioning and public owner lookup.

## Public API and concepts

| Concept        | Closed values or states                                | Meaning                                 | Default                   | Owner                                     | Stability |
| -------------- | ------------------------------------------------------ | --------------------------------------- | ------------------------- | ----------------------------------------- | --------- |
| axis           | `inline`, `block`, `both`                              | requested logical scroll intent         | required                  | `spec:AST-025`                            | stable    |
| keyboard owner | `content`, named `viewport`, named `contentOrViewport` | fixed or automatic keyboard scroll path | required                  | `spec:AST-025`                            | stable    |
| overscroll     | `allow`, `contain`                                     | edge propagation on effective axes      | `allow`                   | `spec:AST-025`                            | stable    |
| axis state     | `isScrollable`, `atStart`, `atEnd`                     | effective ownership and logical edges   | inactive, both edges true | `module:ScrollableArea/useScrollableArea` | stable    |

## Behavioral contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                        | Basis                       | Acceptance and implementation state     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------- |
| FR1 | An axis MUST be effective only when requested, computed overflow is scroll-capable, and geometry exceeds 1px.                                                                                                                                                                                                                                                                    | `spec:AST-025` FR1–FR4      | implemented                             |
| FR2 | Viewport and content geometry MUST be observed; invalidations MUST coalesce and preserve the last valid state while unmeasurable.                                                                                                                                                                                                                                                | `spec:AST-025` FR5–FR9      | implemented                             |
| FR3 | Logical edges and behavior-owned physical overflow MUST map through direction and horizontal, vertical, or sideways writing modes without requiring adopters to recreate the mapping.                                                                                                                                                                                            | `spec:AST-025` FR1, FR3–FR4 | implemented                             |
| FR4 | The nearest registered effective owner MUST win independently by axis.                                                                                                                                                                                                                                                                                                           | `spec:AST-025` FR10, FR18   | implemented privately for future Sticky |
| FR5 | Viewport keyboard props and overscroll containment MUST appear only while applicable requested axes are effective.                                                                                                                                                                                                                                                               | `spec:AST-025` FR12–FR14    | implemented                             |
| FR6 | Prop getters MUST compose refs and preserve caller handlers/classes/styles/ARIA while behavior-owned accessibility and non-cancellable behavior win conflicts.                                                                                                                                                                                                                   | `spec:AST-025` IR4          | implemented                             |
| FR7 | The viewport prop getter MUST consume caller `xstyle` and internally compose geometry-driven `clip`/`auto`/`hidden` overflow plus explicit fitting Sticky containment.                                                                                                                                                                                                           | `spec:AST-025` FR21         | implemented                             |
| FR8 | `contentOrViewport` MUST retain the named overflowing viewport, inspect the first sequential descendant on forward Tab entry, and delegate only to a native link/button outside navigation-key-owning surfaces. Reverse traversal from the delegated first child skips the viewport. Pointer/programmatic focus never delegates; eligibility is checked again on the next entry. | `spec:AST-025` FR12–FR13    | implemented                             |

### Transformation and precedence order

- **ORD1 — Effective state.** requested logical axis → computed physical axis →
  scroll-capable overflow → geometry tolerance → normalized logical edge.
- **ORD2 — Prop composition.** caller props and `xstyle` → behavior-owned
  fitting/active overflow style → stable composed ref → behavior-owned keyboard,
  state, and chaining outputs.

### Performance and resources

- **PR1 — Stable publication.** Equal effective/edge state reuses the prior object.
- **PR2 — Shared observation.** Both element boxes use the shared ResizeObserver;
  all secondary invalidation signals coalesce through one animation frame.

## Accessibility contract

- **AR1 — Named viewport owner.** Fixed viewport and automatic access require a
  label and retain `tabIndex=0` while effectively scrollable. Automatic access
  delegates only on forward keyboard entry; the descendant retains its own name
  inside the named viewport group/region.
- **AR2 — Focus continuity.** Content, eligibility, and geometry changes never
  move or blur focus. A viewport losing overflow while focused remains
  programmatically focusable. Reverse traversal from the delegated first child
  skips the viewport, including after visiting later descendants.
- **AR3 — Conservative eligibility.** Inspect the first sequential target; do not
  search past an excluded one for a link/button. Composite roles, editable
  surfaces, native or registered nested scroll owners, positive tab ordering,
  popup triggers, and unproven interactive roles retain the viewport path.
- **AR4 — Native scrolling.** Delegation MUST preserve Arrow/Page access to both
  scroll edges without implementing JavaScript scrolling.

## Design relationships

No visual representation is owned by this hook.

## Parent and system relationships

- `component:ScrollableArea` owns the reference viewport/content composition.
- `spec:AST-025` owns the shared behavior and adoption boundary.

## Verification map

| Contract         | Verification                                                                                                     | Representative states                                                                                                                                  | Mutation or failure expectation                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR8, AR1–AR4 | `useScrollableArea.test.tsx`, `scrollKeyboardDelegation.test.ts`, and `BottomSheetKeyboard.a11y.browser.spec.ts` | horizontal/vertical/sideways, LTR/RTL, fit/overflow/edge, fixed/automatic keyboard owners, dynamic descendant eligibility, nested owners, focused loss | style-only or geometry-only ownership, physical-edge leakage, duplicate/missing keyboard path, stale state, ref loss, or dead containment fails |

## Decision log

### DEC-1 — Prop getters are the public composition seam

**Reference:** `module:ScrollableArea/useScrollableArea/DEC-1`
**Decider:** cixzhang, 2026-09-11

One returned prop object per owned element keeps refs, accessibility, handlers,
and behavior together without making consumer spread order part of correctness.

### DEC-2 — Automatic ownership is shared behavior

**Reference:** `module:ScrollableArea/useScrollableArea/DEC-2`
**Decider:** cixzhang, 2026-09-13

`contentOrViewport` retains the named overflowing viewport and delegates only on
forward Tab entry to a safe first sequential native link/button. This replaces
continuous keyboard-eligibility observation. Geometry observation is unchanged;
keyboard eligibility adds no subtree or ancestor observers and is inspected anew
at each entry. BottomSheet is a proving composition of this shared behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer signatures/examples, ScrollableArea's
structure/presentation, or Sticky's future API and positioning mechanism.
