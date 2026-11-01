---
schema_version: 3
template_version: 7
kind: component
id: component:Stack
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
owners: [cixzhang]
review_triggers: [public-api, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/serverSafeComponents.test.ts,
    .github/visual-baseline/manifest.json,
    packages/core/src/Stack/Stack.test.tsx,
    packages/core/src/Stack/StackItem.test.tsx,
    packages/core/src/HStack/HStack.test.tsx,
    packages/core/src/VStack/VStack.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/Stack.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:layout-primitives]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:container-padding,
    architecture:public-component-api,
  ]
contributing: []
system_specs: []
---

# Stack component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Stack arranges children on one flex axis with `direction`, alignment, `gap`, per-edge `padding`, sizing, `wrap`, `isScrollable`, and `as`. HStack and VStack fix the direction; StackItem controls one child's participation. |
| Behavior                | Alignment props resolve to the main or cross axis from the direction; padding resolves per logical edge; padding stays local and publishes no container inset.                                                                |
| End-user impact         | Readers see consistent spacing and alignment that follows the writing direction.                                                                                                                                              |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                                                                  |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes.                                                                                                                                                    |
| Review checks           | Reject physical left/right padding, an alias that wins over an explicit alignment, padding that publishes container inset, or a StackItem without the flex minimum reset.                                                     |
| Governing rules         | `family:layout-primitives/FR1–FR6,FR8`; `architecture:container-padding/INV8`; `architecture:public-component-api/INV5,INV6,INV8`.                                                                                            |

This table is a review projection; the body below is authoritative.

## Intent

Stack is the one-dimensional layout primitive. It owns direction, axis-aware
alignment, gap, local padding, sizing, wrapping, and scrolling for a flex
container, and StackItem owns one child's growth, alignment, and scrolling
inside it.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Stack, and HStack, VStack, and StackItem, which `Stack.doc.mjs` documents as
  inline `components:` entries. This record covers all four; none has its own
  consumer doc or record.
- The Stack container and its `stack` target; the StackItem wrapper and its
  `stack-item` target.
- Axis resolution for alignment, per-edge padding resolution, gap, sizing,
  wrapping, and scrolling.

**Does not own / non-goals**

- Content supplied to Stack or StackItem — owned by the caller.
- Container-inset publication and descendant bleed — owned by publishers under
  `architecture:container-padding`; Stack padding is local.
- Two-dimensional layout — owned by `component:Grid`; centering — owned by
  `component:Center`.

## Public concepts

| Concept   | Closed values or states                                                                                           | Meaning                                                           | Availability by variant/orientation/state | Default                                       | Owner             | Stability | Invalid-value behavior                                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------- | ----------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direction | `horizontal`, `vertical`                                                                                          | Flex row or column. HStack is horizontal; VStack is vertical.     | Stack only; fixed on HStack and VStack    | `vertical`                                    | `component:Stack` | Stable    | TypeScript rejects other values.                                                                                                                                                       |
| Alignment | main axis `start`, `center`, `end`, `between`, `around`, `evenly`; cross axis `start`, `center`, `end`, `stretch` | `hAlign`/`vAlign` by physical name, or `justify`/`align` by axis. | All stacks                                | browser default (`stretch` on the cross axis) | `component:Stack` | Stable    | Stack accepts every alignment value on `hAlign` and `vAlign` and ignores one that does not apply to the resolved axis; HStack, VStack, `justify`, and `align` reject it in TypeScript. |
| Gap       | Spacing steps 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10                                                                | Row and column gap.                                               | All stacks                                | unset                                         | `component:Stack` | Stable    | TypeScript rejects other values.                                                                                                                                                       |
| Padding   | Spacing steps per edge, per axis, or uniform                                                                      | Local inner padding.                                              | All stacks                                | unset                                         | `component:Stack` | Stable    | TypeScript rejects other values.                                                                                                                                                       |
| Wrap      | `nowrap`, `wrap`, `wrap-reverse`                                                                                  | Flex wrapping.                                                    | All stacks                                | unset (`nowrap`)                              | `component:Stack` | Stable    | TypeScript rejects other values.                                                                                                                                                       |
| Item size | `static`, `fill`                                                                                                  | StackItem neither grows nor shrinks, or grows to fill.            | StackItem                                 | `static`                                      | `component:Stack` | Stable    | TypeScript rejects other values.                                                                                                                                                       |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                | Basis                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | Stack renders the element named by `as` (default `div`) as a flex container in the given direction, carrying the `stack` target, which reflects `direction`, `gap`, and `wrap`. HStack renders Stack with `direction="horizontal"` and VStack with `direction="vertical"`.                                                                               | Current source and tests |
| FR2 | `hAlign` and `vAlign` name physical axes: in a horizontal stack `hAlign` sets main-axis justification and `vAlign` cross-axis alignment, and in a vertical stack the reverse. `justify` and `align` name the main and cross axes and apply only when the matching `hAlign` or `vAlign` is absent. Unset alignment leaves the browser defaults.           | Current source and tests |
| FR3 | `gap` sets equal row and column gaps from the spacing scale. Padding resolves per logical edge: the edge prop, then its axis prop (`paddingInline` or `paddingBlock`), then `padding`; inline edges follow the writing direction.                                                                                                                        | Current source and tests |
| FR4 | Stack padding is local: it publishes no container-padding variables, so descendants cannot use it for bleed compensation.                                                                                                                                                                                                                                | Current source           |
| FR5 | `width`, `height`, `maxWidth`, and `minHeight` apply numbers as pixels and strings as given, as inline styles after the caller's `style`. `wrap` sets flex wrapping. `isScrollable` sets `overflow: auto`.                                                                                                                                               | Current source and tests |
| FR6 | StackItem renders the element named by `as` (default `div`) carrying the `stack-item` target, which reflects `size`; it always resets its minimum width and height to zero, `static` neither grows nor shrinks, `fill` grows to share remaining space, `crossAlignSelf` overrides the stack's cross alignment, and `isScrollable` sets `overflow: auto`. | Current source and tests |
| FR7 | `ref` reaches the rendered element of Stack, HStack, VStack, and StackItem. Supported DOM, ARIA, data, and event props reach it; `xstyle`, `className`, and `style` merge in that order after component styles.                                                                                                                                          | Current source and tests |

### Allowed variation

- **AV1 — Element.** Callers choose the element through `as`.
- **AV2 — Theme paint.** A theme may restyle `stack` and `stack-item` without
  changing axis resolution or padding precedence.

### Representative states

| State                   | Required invariant                                                                      | Allowed variation |
| ----------------------- | --------------------------------------------------------------------------------------- | ----------------- |
| Vertical default        | Flex column; `data-direction="vertical"`.                                               | Children.         |
| Horizontal with aliases | `justify` sets the main axis, `align` the cross axis, unless `hAlign`/`vAlign` are set. | —                 |
| Per-edge padding        | Each edge resolves independently; inline edges mirror in right-to-left.                 | —                 |
| Fill and scroll item    | `StackItem size="fill" isScrollable` grows and scrolls its own overflow.                | —                 |

### Transformation and precedence order

- **ORD1 — Alignment.** `hAlign`/`vAlign` → `justify`/`align` by axis → browser
  default.
- **ORD2 — Padding per edge.** Edge prop → axis prop → `padding`.
- **ORD3 — Sizing.** Caller `style` → sizing props.

### Performance and resources

- **PR1 — Static render.** Stack, HStack, VStack, and StackItem hold no state and
  use no hooks.

## Accessibility contract

- **AR1 — No semantics added.** Stack and StackItem add no role, name, or tab
  stop of their own; their semantics are those of the `as` element.

## Design relationships

| Anatomy or state | Design requirement                             | Representation authority                  | Hierarchy role    | Component contract |
| ---------------- | ---------------------------------------------- | ----------------------------------------- | ----------------- | ------------------ |
| Stack container  | The one-dimensional layout container.          | Current source, docs, and family contract | Supporting        | FR1–FR5            |
| Item             | Optionally controls one child's participation. | Current source, docs, and family contract | Supporting        | FR6                |
| Content          | Caller content in either wrapper.              | Caller-supplied content                   | Context-dependent | AR1                |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Stack container": {"target": "stack"},
  "Item": {"target": "stack-item"},
  "Content": {
    "none": {
      "reason": "intentional: Caller-supplied content retains its own theming ownership; Stack and StackItem apply no content target."
    }
  }
}
```

## Family and system relationships

- `family:layout-primitives` owns the shared spacing, padding precedence, and
  modifier rules; Stack, HStack, VStack, and StackItem are members, and FR2,
  FR3, and FR6 apply them.
- `architecture:container-padding` records Stack padding as local (FR4).
- `architecture:public-component-api` owns ref, passthrough, and styling-input
  rules; FR7 applies them.

## Verification map

| Contract            | Verification                                                                                                       | Representative states                                            | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                     | Audit section          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| FR1, FR2            | `Stack.test.tsx`, `HStack.test.tsx`, `VStack.test.tsx` element tests; stable visual baseline `core-stack--default` | Default and `as` elements; default stack                         | A wrong default or `as` element fails; a changed default direction, gap, or alignment comes back changed for review. Gap: the direction, alignment, and alias tests assert only that content renders, so direction, `hAlign`/`vAlign` mapping, alias precedence, the `stack` target, and its reflection have no unit check.                                                                         | `audit:Stack/layout`   |
| FR3                 | `Stack.test.tsx` padding-precedence tests; `@astryx/no-physical-properties` lint rule                              | Uniform, axis, edge, all four edges                              | A missing padding class, edge over axis on the end edges, edge over uniform on the edges the tests pair, or a physical left/right padding property fails. Gap: edge over axis on the start edges, axis over uniform, any untested edge-over-uniform pairing, and the gap value (the gap test asserts only that content renders) have no check, and no browser right-to-left check covers the edges. | `audit:Stack/layout`   |
| FR5                 | `Stack.test.tsx` sizing and scrolling tests                                                                        | Numeric and string sizes; scrollable                             | A wrong computed width or height, or no class change for `isScrollable`, fails. Gap: `wrap`, `maxWidth`, `minHeight`, and size winning over caller `style` have no check.                                                                                                                                                                                                                           | `audit:Stack/layout`   |
| FR6                 | `StackItem.test.tsx` element, scroll, and passthrough tests                                                        | Default and `as` elements; scrollable; `size="fill"` with scroll | A wrong element, or no class change for `isScrollable`, fails. Gap: the size and `crossAlignSelf` tests assert only that content renders, so the minimum-size reset, `static`, `fill`, cross alignment, and the `stack-item` target have no check.                                                                                                                                                  | `audit:Stack/layout`   |
| FR7                 | Ref and pass-through tests in all four suites                                                                      | Default and `as` elements                                        | A dropped ref fails in all four suites, and a dropped `aria-label` in the Stack and StackItem suites (the HStack and VStack pass-through tests assert `data-testid` only). Gap: the ref tests accept any element, so a ref on a wrapper passes, and the styling-input merge order has no check.                                                                                                     | `audit:Stack/behavior` |
| FR4                 | Source review against `architecture:container-padding`                                                             | Padded stack                                                     | Gap: no automated check fails if Stack publishes container-padding variables.                                                                                                                                                                                                                                                                                                                       | `audit:Stack/layout`   |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                      | Consumer anatomy and current targets                             | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                                                                                                                       | `audit:Stack/theming`  |
| AR1, PR1            | `serverSafeComponents.test.ts`; source review                                                                      | Every form                                                       | A client API (state, an effect, a context read) added without a client directive fails `serverSafeComponents.test.ts`. Gap: a client API added together with a client directive passes, and no automated check fails if Stack or StackItem adds a role.                                                                                                                                             | `audit:Stack/behavior` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
