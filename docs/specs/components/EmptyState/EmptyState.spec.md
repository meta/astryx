---
schema_version: 3
template_version: 7
kind: component
id: component:EmptyState
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility, testing]
verified_by:
  [
    packages/core/src/EmptyState/EmptyState.test.tsx,
    packages/core/src/EmptyState/EmptyState.announce.test.tsx,
    .github/visual-baseline/manifest.json,
    scripts/check-knowledge.mjs,
    packages/core/src/theme/themingTargets.test.ts,
    packages/core/src/docPropReferences.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:component-test-sufficiency,
  ]
contributing: []
system_specs:
  [spec:AST-009, spec:AST-020/FR1, spec:AST-086/FR2, spec:AST-086/FR11]
---

# EmptyState component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `EmptyState` renders a required title plus optional description, decorative icon, and caller-owned actions in one root without a live role; callers choose heading level and compact layout.     |
| Behavior                | Null, undefined, boolean, and empty-string optional values create no slot wrapper. Rendered content follows icon, text, then actions order; compact layout reduces spacing and stacks actions.   |
| End-user impact         | A person reaches a named empty-content message and any next action without blank gaps from shallow-empty optional values; the title fits the surrounding document outline.                       |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                                     |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes.                                                                                                                       |
| Review checks           | Reject a missing heading, an informative icon hidden as decorative, a shallow-empty optional scalar that still changes layout, a dropped root prop/ref/style, or a theme target without anatomy. |
| Governing rules         | `architecture:public-component-api` INV1 and INV5–INV9; `architecture:component-theming-surface` INV2–INV6; `architecture:component-test-sufficiency` INV1–INV7, INV10–INV11; WCAG 2.2.          |

This table is a review projection; the body below is authoritative.

## Intent

`EmptyState` gives an otherwise empty content area a semantic heading, supporting
context, optional decorative visual, and optional caller-owned next actions.

## Compatibility and migration

- Released default preserved: `yes` — heading level 3, default layout, no
  live role on the root.
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- the root, content order, heading element, and default/compact layout;
- hiding the icon slot from assistive technology as decorative; and
- whether optional slots create component-owned wrappers and spacing.

**Does not own / non-goals**

- the message copy, icon meaning, action controls, or action behavior — those belong to the product callsite and the components it supplies;
- page-level heading order — the caller chooses `headingLevel` for its document; or
- error, loading, or populated-content behavior.

## Public concepts

| Concept        | Closed values or states | Meaning                                                                   | Availability by variant/orientation/state | Default  | Owner                  | Stability | Invalid-value behavior                                  |
| -------------- | ----------------------- | ------------------------------------------------------------------------- | ----------------------------------------- | -------- | ---------------------- | --------- | ------------------------------------------------------- |
| title          | string                  | The empty region's heading content.                                       | all                                       | required | `component:EmptyState` | stable    | type rejection                                          |
| description    | string or absent        | Optional supporting context below the title.                              | all                                       | absent   | `component:EmptyState` | stable    | nullish and empty-string values omit the part           |
| icon           | React node or absent    | Optional caller visual, exposed as decorative beside the textual message. | all                                       | absent   | product callsite       | stable    | nullish, boolean, and empty-string values omit the slot |
| actions        | React node or absent    | Optional caller-owned next actions below the message.                     | all                                       | absent   | product callsite       | stable    | nullish, boolean, and empty-string values omit the slot |
| heading level  | `1` through `6`         | The title's HTML heading level in the surrounding document outline.       | all                                       | `3`      | product callsite       | stable    | type rejection                                          |
| layout variant | default, compact        | Compact reduces spacing and stacks the action slot vertically.            | all                                       | default  | `component:EmptyState` | stable    | type rejection                                          |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                               | Basis                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| FR1 | The component MUST render one root containing the icon, text group, and actions in that reading order when present. The component MUST NOT add a live role or `aria-live` to the root.  | Current implementation and consumer docs; `spec:AST-086` FR2; WCAG 2.2 SC 1.3.2      |
| FR2 | The required title MUST render at the caller-selected heading level without changing the component's visual type role.                                                                  | Current implementation, tests, and consumer docs; WCAG 2.2 SC 1.3.1 and SC 2.4.6     |
| FR3 | Null, undefined, boolean, and empty-string optional values MUST NOT create a wrapper, layout gap, or assistive-technology node; containers that are shallowly non-empty remain wrapped. | React's direct-child rendering semantics; established public optional-slot interface |
| FR4 | The decorative icon wrapper MUST be absent when the slot is absent and hidden from assistive technology when rendered.                                                                  | Current implementation and tests; WCAG 2.2 SC 1.1.1                                  |
| FR5 | Root DOM/data/ARIA/event props, ref, `className`, `style`, and `xstyle` MUST reach and compose on the root.                                                                             | `architecture:public-component-api` INV5–INV8                                        |
| FR6 | Compact layout MUST reduce component spacing and stack the actions slot while preserving content order and root semantics.                                                              | Current implementation, tests, and consumer docs                                     |

### Allowed variation

- **AV1 — Caller content.** Message wording, decorative artwork, and action
  composition may vary at the product callsite.
- **AV2 — Theme paint.** Theme-controlled paint and typography may vary through
  the documented targets while anatomy and content order remain stable.

### Representative states

| State                         | Required invariant                                        | Allowed variation                      |
| ----------------------------- | --------------------------------------------------------- | -------------------------------------- |
| title only                    | root and selected heading level remain present            | message wording                        |
| description                   | supporting text follows the title                         | text length and wrapping               |
| decorative icon               | visual precedes text and is hidden from assistive tech    | artwork supplied by the caller         |
| actions                       | caller controls follow the text group                     | one or more caller-owned controls      |
| compact                       | reduced spacing and vertical actions preserve semantics   | theme paint and caller content         |
| shallow-empty optional scalar | nullish, boolean, and empty-string values emit no wrapper | which optional slot receives the value |

### Transformation and precedence order

- **ORD1 — Root composition.** Component semantics and theme metadata combine
  with component styles, then consumer `xstyle`, `className`, and `style` under
  the shared merge contract. The component sets no role, so a caller's `role`
  reaches the root unchanged.

### Performance and resources

- **PR1 — No resources of its own.** EmptyState holds no state, listener,
  observer, or timer of its own; the shared announcement wrapper around its
  text owns the observation that announces it (`spec:AST-086`).

## Accessibility contract

- **AR1 — Heading semantics.** The title is a heading at the caller-selected level.
- **AR2 — Decorative visual.** The icon slot is hidden from assistive technology;
  callers keep all necessary meaning in the title or description.
- **AR3 — No live region; announced when it appears.** EmptyState adds no live
  role or `aria-live` to the root and does not move focus. Rendered or changed
  before the document finished loading (or while hydrating), it announces
  nothing. When it appears, or its message changes, later, it announces its
  message once through the shared polite channel (`spec:AST-086` FR2, FR11).
  The message is the title and description, without content hidden from
  assistive technology; action labels are not part of it. Action controls keep
  their own names, roles, and behavior.

## Design relationships

No current design record governs EmptyState-specific representation. Visual
judgment remains evidence, not product authority.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Container": {"target": "empty-state"},
  "Icon": {
    "none": {
      "reason": "intentional: caller-supplied decorative content keeps its own styling and has no component-owned paint target"
    }
  },
  "Title": {"target": "empty-state-title"},
  "Description": {"target": "empty-state-description"},
  "Actions": {
    "none": {
      "reason": "intentional: caller-supplied controls keep their own component targets and behavior"
    }
  }
}
```

## Family and system relationships

No current family record owns EmptyState-specific behavior.

## Verification map

| Contract            | Verification                                                                                                                           | Representative states                                                                                                                 | Mutation or failure expectation                                                                                                                                                                                                                                                                           | Audit section              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| FR1, FR3, FR4, AR2  | `EmptyState.test.tsx` slot, order, decorative-icon, empty-slot, and live-role tests; stable visual baseline `core-emptystate--default` | Title only; all slots; absent and shallow-empty slots                                                                                 | A wrapper for an absent or shallow-empty slot, a changed slot order, an icon not hidden from assistive technology, or a live role on the root fails; a changed default layout comes back changed for review. Gap: no accessibility-tree check proves the hidden icon or the heading (`spec:AST-009` FR3). | `audit:EmptyState/a11y`    |
| FR2, AR1            | `EmptyState.test.tsx` heading tests                                                                                                    | Default level 3; every level                                                                                                          | A title that is not the selected heading element fails. Gap: no check that the title keeps one type style at every heading level.                                                                                                                                                                         | `audit:EmptyState/a11y`    |
| AR3                 | `EmptyState.announce.test.tsx`                                                                                                         | Render with the page; appear later; iframe; inside a live container; message change; server render and hydration; hidden and revealed | An announcement during load or hydration, a missing or repeated announcement when it appears or changes later, hidden text in the message, or an announcement inside a live container fails. Gap: no test asserts that focus stays where it was when EmptyState appears.                                  | `audit:EmptyState/a11y`    |
| FR5, ORD1           | `EmptyState.test.tsx` ref, `data-testid`, and root-composition tests                                                                   | DOM, data, event, style inputs; caller role; ref                                                                                      | A dropped input, a replaced caller role, or a ref that is not a `div` fails. Gap: the ref test checks only that the ref is a `div`, not that it is the root. No test asserts that caller `xstyle` follows the component styles.                                                                           | `audit:EmptyState/api`     |
| FR6                 | `EmptyState.test.tsx` compact and theming-target tests                                                                                 | Default and compact                                                                                                                   | A compact layout that is not reflected on the root, title, and description, or that changes slot order, fails. Gap: the reduced spacing and stacked actions have no automated check.                                                                                                                      | `audit:EmptyState/layout`  |
| PR1                 | Source review                                                                                                                          | Every render path                                                                                                                     | Gap: no automated check fails if EmptyState adds state, a listener, or a timer of its own.                                                                                                                                                                                                                | `audit:EmptyState/code`    |
| Theming anatomy map | `scripts/check-knowledge.mjs`; `themingTargets.test.ts`                                                                                | Consumer anatomy and current targets                                                                                                  | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                             | `audit:EmptyState/theming` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
