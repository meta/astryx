---
schema_version: 3
template_version: 7
kind: component
id: component:DrawerHeader
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-30
owners: [cixzhang, imdreamrunner]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Drawer/DrawerHeader.test.tsx,
    apps/storybook/stories/DrawerHeader.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:layout-regions]
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:container-padding]
contributing: []
system_specs: []
---

# DrawerHeader component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `DrawerHeader` with `title`, `subtitle`, `onOpenChange`, `startContent`, `endContent`, `endContentEdgeCompensation` (`inline`, `block`, `all`), and `hasDivider`; five `drawer-header` targets. |
| Behavior                | A Layout header row for a Drawer: optional start content, an h2 title with optional subtitle, optional end content, and a close button only when `onOpenChange` is given.                       |
| End-user impact         | Users see the drawer's title and, when the caller provides one, a named close button; focus is not moved when the header mounts.                                                                |
| Builder impact          | None.                                                                                                                                                                                           |
| Compatibility/readiness | Records shipped behavior; no public change.                                                                                                                                                     |
| Review checks           | Reject a close button rendered without `onOpenChange`, a header that names the Drawer or moves focus on mount, or a title that is not an h2.                                                    |
| Governing rules         | `component:Drawer` (the panel and naming); `family:layout-regions`; `architecture:component-theming-surface`.                                                                                   |

This table is a review projection; the body below is authoritative.

## Intent

DrawerHeader is the optional title row a caller composes in a Drawer's Layout
header slot. It owns the row's parts, its close button, and its targets.
Consumer usage lives in `DrawerHeader.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: the close button calls the caller's
  `onOpenChange(false)` and owns no state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The header row, its slots, title semantics, close button, end-content edge
  compensation, and five targets (FR1–FR5).

**Does not own / non-goals**

- The Drawer's name, focus entry, and open state — owned by `component:Drawer`.
- The header region's padding, divider default, and place in the Layout — owned
  by `family:layout-regions` through `LayoutHeader`.
- The close Button — owned by `component:Button`.

## Public concepts

| Concept                  | Closed values or states           | Meaning                                                                                       | Availability by variant/orientation/state | Default                                              | Owner                    | Stability | Invalid-value behavior           |
| ------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- | ------------------------ | --------- | -------------------------------- |
| End-content compensation | `inline`, `block`, `all`, omitted | Which edges of the end slot pull outward to align a trailing control with the container edge. | End slot.                                 | Both axes when `onOpenChange` is set, none otherwise | `component:DrawerHeader` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                 | Basis                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | DrawerHeader renders inside a LayoutHeader that receives `ref`, `hasDivider`, `xstyle`, `className`, `style`, and other DOM props. Its row carries `drawer-header` and shows, in order, start content, the title block, and the end slot. | Current source and tests |
| FR2 | The title renders as an h2; a renderable `subtitle` (including `0`) renders below it as secondary small body text, and an empty one renders nothing. Start and end slots render when their content is renderable, including `0`.          | Current source and tests |
| FR3 | With `onOpenChange`, the end slot ends with an icon-only ghost Button named and tooltipped by `@astryx.dialog.close` that calls `onOpenChange(false)`; without it there is no close button.                                               | Current source and tests |
| FR4 | The end slot pulls outward by `--spacing-2` on the block axis, the inline-end edge, or both, per `endContentEdgeCompensation`; when omitted, both apply only if there is a close button.                                                  | Current source           |
| FR5 | The start slot, title block, end slot, and close glyph carry `drawer-header-start-content`, `drawer-header-title-block`, `drawer-header-end-content`, and `drawer-header-close-icon`.                                                     | Current source and tests |
| FR6 | Mounting the header does not move focus, and the header does not name the Drawer.                                                                                                                                                         | Current source and tests |

### Allowed variation

- **AV1 — Slots.** Start, end, and subtitle content vary or are absent.

### Representative states

| State               | Required invariant                                | Allowed variation |
| ------------------- | ------------------------------------------------- | ----------------- |
| Title only          | h2 title; no close button.                        | —                 |
| With `onOpenChange` | Named close button at the end; edges compensated. | End content.      |
| Start and end slots | Order: start, title block, end.                   | Content.          |

### Transformation and precedence order

- **ORD1 — Compensation.** `endContentEdgeCompensation`, then the close-button
  default (FR4).

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Heading.** The title is an h2.
- **AR2 — Close name.** FR3's translated name and tooltip.
- **AR3 — Focus.** FR6.

## Design relationships

| Anatomy or state | Design requirement                            | Representation authority       | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Header row       | Start, title block, end in one row.           | Current source and public docs | Supporting     | FR1                |
| Start content    | Leading caller content.                       | Current source and public docs | Supporting     | FR2, FR5           |
| Title block      | Title and optional subtitle.                  | Current source and public docs | Prominent      | FR2, FR5           |
| End content      | Trailing caller content and the close button. | Current source and public docs | Supporting     | FR3–FR5            |
| Close icon       | Close glyph inside the button.                | Current source and public docs | Supporting     | FR3, FR5           |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Header row": {"target": "drawer-header"},
  "Start content": {"target": "drawer-header-start-content"},
  "Title block": {"target": "drawer-header-title-block"},
  "End content": {"target": "drawer-header-end-content"},
  "Close icon": {"target": "drawer-header-close-icon"}
}
```

## Family and system relationships

- `component:Drawer` hosts the header in its Layout and owns naming and focus.
- `family:layout-regions` owns the header region it renders into.

## Verification map

| Contract            | Verification                                 | Representative states                    | Mutation or failure expectation                    | Audit section                      |
| ------------------- | -------------------------------------------- | ---------------------------------------- | -------------------------------------------------- | ---------------------------------- |
| FR1, FR2, AR1       | `DrawerHeader.test.tsx` title and slot tests | Title, subtitle, `0` values, empty slots | Wrong heading level or dropped content fails.      | `audit:DrawerHeader/anatomy`       |
| FR3, AR2            | `DrawerHeader.test.tsx` close-button tests   | With and without `onOpenChange`          | A button without a callback, or no name, fails.    | `audit:DrawerHeader/accessibility` |
| FR5                 | `DrawerHeader.test.tsx` theming target test  | All slots                                | A missing target fails.                            | `audit:DrawerHeader/theming`       |
| FR6, AR3            | `DrawerHeader.test.tsx` focus test           | Mount                                    | Focus moved on mount fails.                        | `audit:DrawerHeader/accessibility` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                | Consumer anatomy and current targets     | Missing, extra, or stale mappings fail validation. | `audit:DrawerHeader/theming`       |

FR4 is read from source; no focused test checks it yet.

Read from source, with no focused test yet:

- FR1: `ref`, `hasDivider`, `xstyle`, `className`, `style`, and other DOM
  props reaching the LayoutHeader.
- FR3: the close button's tooltip.
- FR4: the end slot's edge compensation.
- FR6: the header not naming the Drawer.

## Decision log

No component-local decision is recorded.

## Open questions

- How do `endContentEdgeCompensation`'s `inline`, `block`, and `all` axis
  values map onto `endContentEdge` treatment values
  (`architecture:container-padding`), and when does the old prop enter its
  compatibility window? Today the prop stays supported as released.

## Content boundary

This file does not duplicate consumer prop tables, examples, or Drawer
behavior. It links to their owners.
