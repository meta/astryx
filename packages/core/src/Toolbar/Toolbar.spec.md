---
schema_version: 3
template_version: 7
kind: component
id: component:Toolbar
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Toolbar/Toolbar.test.tsx,
    packages/core/src/Toolbar/__tests__/Toolbar.a11y.test.tsx,
    packages/core/src/Toolbar/__tests__/Toolbar.a11y.chromium.spec.ts,
    packages/core/src/Section/Section.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:layout-regions]
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:component-theming-surface,
    architecture:container-padding,
    architecture:component-size-cascade,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-020]
---

# Toolbar component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Toolbar` with `label`, `startContent`, `centerContent`, `endContent`, `size` (`md`), `gap` (`1`), `orientation` (`horizontal`), `variant` (`transparent`), and `dividers`; target `toolbar` with `size`.                           |
| Behavior                | A Section-wrapped `role="toolbar"` row with start, optional center, and end lanes. The row is one tab stop; arrow keys, Home, and End move focus among its controls along its orientation.                                          |
| End-user impact         | Keyboard users Tab into the toolbar once and move between its controls with arrows, without losing text-caret keys inside an input or arrow keys inside an open menu; screen-reader users hear a named toolbar and its orientation. |
| Builder impact          | None.                                                                                                                                                                                                                               |
| Compatibility/readiness | Records shipped behavior; no public change. Four implementation gaps (see Current-state impact).                                                                                                                                    |
| Review checks           | Reject more than one tab stop, arrows that steal caret keys from a text input mid-line, caller props that replace `role`, `aria-label`, or `aria-orientation`, or moving outer chrome into Toolbar.                                 |
| Governing rules         | `family:layout-regions`; `spec:AST-020` (toolbar pattern binding); `architecture:container-padding`.                                                                                                                                |

This table is a review projection; the body below is authoritative.

## Intent

Toolbar presents a named contextual action region with one semantic toolbar row
inside Section-owned outer chrome. It owns the row's semantics, lane layout,
keyboard model, and size cascade. Consumer usage lives in `Toolbar.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; runtime, DOM, styling,
  targets, and public API remain unchanged
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **The keyboard hint fades under reduced motion.** The arrow-key hint (FR6)
  fades out over 150 ms (it appears at once) even when reduced motion is
  requested;
  `design:reduced-motion` DR3 allows no animated property for a fine pointer.
- **A vertical toolbar with center content stays side by side.** With
  `orientation="vertical"` and `centerContent`, the three lanes stay in one row
  while `aria-orientation` is vertical and ArrowDown and ArrowUp move between
  them, so the visual order and the announced axis disagree.
- **The tab stop does not follow a pointer click.** After a click on a control
  that does not hold the stop, the stop stays on the earlier control, so
  Shift+Tab from the clicked control lands on that earlier control inside the
  toolbar before leaving it.
- **Links and some fields keep their own tab stops.** A link (such as a Button
  with `href`), `textarea`, or `select` in the row is outside the roving stop:
  it keeps its own tab stop and the arrow keys skip it. The APG toolbar pattern
  makes the toolbar a single tab stop.

## Ownership boundary

**Owns**

- The named toolbar row, toolbar semantics, start/optional-center/end layout,
  keyboard movement, size cascade, and current `toolbar` target.

**Does not own / non-goals**

- The painted outer chrome, variant, block padding, and selected divider edges —
  owned by Section and uncontracted here.
- Content supplied through the three layout slots — owned by the caller or its
  rendered components, except the press tracking `family:action-groups` FR5
  gives Toolbar across its buttons.
- A general arbitrary-child layout primitive contract.
- Arrow-key handling inside composed menus or popovers — owned by those
  components.

## Public concepts

No component-local concept beyond the consumer props; `family:layout-regions`
owns the shared structural-region boundary.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Basis                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| FR1 | The render contains Section-owned Outer chrome around one Toolbar carrying `role="toolbar"`, `aria-label` from `label`, `aria-orientation`, and the `toolbar` target with `size`. Caller `role`, `aria-label`, and `aria-orientation` are dropped; other DOM props reach the toolbar row; `ref`, `className`, `style`, and `xstyle` reach the Section.                                                                                                                                                                                                                                                                                                                                                                                                    | Current source, docs, tests, and family       |
| FR2 | Without center content the Toolbar is a flex line of the present start and end lanes, a row when horizontal and a column of lanes when vertical; with center content it is a three-lane grid whose lanes sit side by side in either orientation. Each lane lays its controls out in a row. No lane clips its content, and the center lane can shrink below its content width. `gap` spaces controls within and between lanes.                                                                                                                                                                                                                                                                                                                             | Current source and focused structure tests    |
| FR3 | Variant (default `transparent`), selected divider edges, and block padding by size remain delegated to Section, while Toolbar retains toolbar semantics, keyboard behavior, and internal layout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source, docs, and family contract     |
| FR4 | The row MUST be a single tab stop. ArrowRight and ArrowLeft (horizontal) or ArrowDown and ArrowUp (vertical) move focus between its controls, wrapping at the ends and skipping disabled controls; Home and End move to the first and last. Implementation gap: only buttons, inputs, and elements with `tabindex` share the stop, so links, `textarea`, and `select` keep their own tab stops, and a pointer click does not move the stop (Current-state impact). Arrows do not move focus out of a text input whose caret is mid-line, and inside an open composed menu arrow keys belong to the menu. The toolbar keeps its tab stop after a composed menu is dismissed from outside, and keeps its own arrow movement when rendered inside a popover. | APG toolbar pattern; current source and tests |
| FR5 | Caller `onKeyDown`, `onFocus`, and `onBlur` run first; when the caller cancels the event, the built-in handling is skipped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and tests                      |
| FR6 | Keyboard focus entering the row can show a brief, self-dismissing hint for its arrow-key axis.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Current source                                |
| FR7 | `size` (default `md`) is provided to descendant controls as their default size; Toolbar starts its own size scope and does not inherit an outer size provider (`architecture:component-size-cascade` INV7).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and tests                      |

### Allowed variation

- Caller content may be absent or supplied in the start, center, and end slots
  without changing Outer chrome or Toolbar ownership.
- Size and orientation may change the current row geometry and keyboard axis
  without creating separate anatomy parts or targets.

### Representative states

| State             | Required invariant                                      | Allowed variation                                                                  |
| ----------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Empty toolbar     | Outer chrome and named Toolbar remain rendered.         | No caller slot content.                                                            |
| Two-lane layout   | Start and/or end content use the current flex layout.   | Either lane may be absent.                                                         |
| Three-lane layout | Center content selects the current three-column layout. | Start or end content may be absent.                                                |
| Vertical toolbar  | Toolbar semantics and target remain unchanged.          | Keyboard movement uses the vertical axis; lanes stack only without center content. |

### Transformation and precedence order

- **ORD1 — Events.** Caller handler, then the built-in handler unless cancelled
  (FR5).

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Named toolbar.** FR1's role, name, and orientation.
- **AR2 — Keyboard.** FR4 follows the APG toolbar pattern, apart from FR4's
  implementation gap.

## Design relationships

| Anatomy or state | Design requirement                                                               | Representation authority                  | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------------------------------- | ----------------------------------------- | -------------- | ------------------ |
| Outer chrome     | Supplies the painted surface, padding, and selected boundaries around the row.   | Section                                   | Supporting     | FR1, FR3           |
| Toolbar          | Presents the named toolbar semantics and current two- or three-lane arrangement. | Current source, docs, and family contract | Prominent      | FR1, FR2, FR3      |

The slot contents are caller-owned content inside Toolbar's layout. They do not
become additional Toolbar-owned anatomy or targets.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Outer chrome": {
    "delegatesTo": {"owner": "component:Section", "target": "section"}
  },
  "Toolbar": {"target": "toolbar"}
}
```

## Family and system relationships

- `family:layout-regions` owns the structural-region vocabulary and records
  Toolbar as a Section-backed contextual action region.
- `architecture:container-padding` owns the inherited inset and edge-compensation
  geometry used by the composed Section and Toolbar.
- `architecture:component-theming-surface` owns anatomy qualification, local
  target mapping, and component delegation.
- `architecture:public-component-api` owns the stable prop and slot surface.
- `spec:AST-020` binds the toolbar accessibility pattern exercised by the
  Toolbar a11y tests.

## Verification map

| Contract            | Verification                                                                                                 | Representative states                               | Mutation or failure expectation                                                                                  | Audit section                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| FR1                 | `Toolbar.test.tsx` role, name, pass-through, and Section suites                                              | Empty and populated Toolbar                         | Removing the role/name, Toolbar target, Section composition, or delegated Section target fails current evidence. | `audit:Toolbar/anatomy`       |
| FR2                 | `Toolbar.test.tsx` slot and child-count suites                                                               | Start-only, end-only, two-lane, and three-lane      | Changing current slot presence or two-/three-lane structure fails focused assertions.                            | `audit:Toolbar/layout`        |
| FR3                 | `Toolbar.test.tsx` variant and block-inset tests                                                             | Default and passed variant                          | A variant that no longer reaches Section fails.                                                                  | `audit:Toolbar/theming`       |
| FR4, FR5, AR1–AR2   | `Toolbar.test.tsx` keyboard and composition suites; `Toolbar.a11y.test.tsx`; `Toolbar.a11y.chromium.spec.ts` | Horizontal, vertical, text input, MoreMenu, popover | Extra tab stops, stolen caret keys, or ignored caller cancellation fails.                                        | `audit:Toolbar/accessibility` |
| Target inventory    | `packages/core/src/theme/themingTargets.test.ts`                                                             | Toolbar and delegated Section targets               | Runtime and documented target metadata drift fails target validation.                                            | `audit:Toolbar/theming`       |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                | Canonical anatomy and current local target          | Missing, extra, prefixed, or stale mappings fail repository validation.                                          | `audit:Toolbar/theming`       |

Read from source, with no focused test yet:

- FR1: caller `role`, `aria-label`, and `aria-orientation` being dropped, and
  `className`, `style`, and `xstyle` reaching Section.
- FR2: the flex and grid layouts themselves, and `gap` spacing.
- FR3: divider edges.
- FR5: caller `onFocus` and `onBlur` running first and their cancellation.
- FR4: links, `textarea`, and `select` keeping their own tab stops, and the stop
  staying put after a pointer click.
- FR6.
- FR7: descendant controls taking `size` as their default, and the fresh size
  scope.

Computed inset and edge-compensation geometry for each parent padding state is
not claimed.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, family layout
rules, container-padding mechanics, keyboard algorithms, implementation steps,
or system rules. It links to their owners.
