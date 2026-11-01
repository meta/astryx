---
schema_version: 3
template_version: 7
kind: component
id: component:ListItem
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming]
verified_by:
  [
    packages/core/src/List/List.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:navigation-destinations]
design_specs: []
architecture:
  [
    architecture:component-style-authoring,
    architecture:component-theming-surface,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-057, spec:AST-103]
---

# ListItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `ListItem` with `label`, `description`, `startContent`, `endContent`, `onClick`, `interactiveRef`, `href`, `target`, `rel`, `align`, `isDisabled`, `isSelected`, `swipeActions`, `swipeBehavior`, `xstyle`, `className`, `style`, and `ref`; the row carries `component:List`'s `list-item` target. `itemKey` (`spec:AST-103` DEC-4) is specified but not shipped. |
| Behavior                | One `<li>` row rendered by `component:Item`, which receives every row prop. Inside a List the row takes the list's density, dividers, edge treatment, and marker; outside a List it uses Item's defaults and draws no marker.                                                                                                                                      |
| End-user impact         | Each list entry reads as one list item, with the list's bullet, number, or task checkbox before it and the same interaction Item gives any row.                                                                                                                                                                                                                    |
| Builder impact          | None.                                                                                                                                                                                                                                                                                                                                                              |
| Compatibility/readiness | Records shipped behavior; no public change. Two implementation gaps, listed under Current-state impact.                                                                                                                                                                                                                                                            |
| Review checks           | Reject a row that is not an `<li>`, a ListItem-level edge, density, or divider prop, a marker drawn outside a marked List, or a dropped Item prop.                                                                                                                                                                                                                 |
| Governing rules         | `component:Item` (`align` for start and end content); `component:List`; `family:navigation-destinations`; `spec:AST-057`; `spec:AST-103`; `architecture:component-theming-surface`; `architecture:component-style-authoring` INV7.                                                                                                                                 |

This table is a review projection; the body below is authoritative.

## Intent

ListItem is the row a List renders for each entry. It owns turning a row into
a list item: the `<li>` element, what it reads from its List, the marker drawn
before it, and how it applies `component:List`'s `list-item` target. Everything a row does as a row comes
from `component:Item`. Consumer usage lives in `ListItem.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable; `isSelected` and
  `isDisabled` are caller-owned
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Markers are extra elements.** A bullet marker is drawn as two decorative
  `span` elements, and a number marker as one `span` carrying a counter
  pseudo-element, beside the row's content. `architecture:component-style-authoring`
  INV7 carries decoration with no semantic role on a pseudo-element rather than
  an added element.
- **ListItem has no `itemKey` yet.** `spec:AST-103` DEC-4 and `component:List`
  FR12 have each reorderable row name its item through an `itemKey` prop;
  ListItem does not accept one yet.

## Ownership boundary

**Owns**

- Rendering the row as an `<li>` through `component:Item` and passing it every
  row prop (FR1).
- Reading density, dividers, edge treatment, and marker from the enclosing
  List, and the defaults outside one (FR2, FR3).
- Drawing the marker or a task item's read-only checkbox (FR4).
- Applying `component:List`'s `list-item` target to the row (FR5).

**Does not own / non-goals**

- `align`, the start and end content's alignment — owned by `component:Item`; swipe actions — owned by
  `spec:AST-057`; link destinations — owned by
  `family:navigation-destinations`, of which ListItem is a member.
- Item's label, description, slots, invisible button, delegated activation,
  and disabled and selected semantics — Item's shipped behavior, uncontracted
  here.
- What each edge treatment does to row geometry and the row inset, the touch
  target, press paint, row motion, and row menus — owned by `component:List`.
- The `ListMarkerScope` that sets a marker or task state for Markdown's nested
  lists — internal and uncontracted here.
- Whole number markers and text alignment for Markdown lists — owned by
  `spec:AST-061` FR11 and `component:List` DEC-5.

## Public concepts

No component-local concept beyond the consumer props; row props are
`component:Item`'s.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | ListItem renders `component:Item` as an `<li>` and passes `label`, `description`, `startContent`, `endContent`, `onClick`, `interactiveRef`, `href`, `target`, `rel`, `align`, `isDisabled`, `isSelected`, `swipeActions`, `swipeBehavior`, and `ref` to it unchanged, with other DOM and data props reaching the row.                                                                                                                                  | Current source and tests |
| FR2 | Inside a List, the row takes the list's `density`, its `hasDividers` setting, which draws a divider between rows with no extra element and square corners, and its `edge` treatment.                                                                                                                                                                                                                                                                    | Current source and tests |
| FR3 | Outside a List, the row uses `balanced` density, no dividers, the `padded` treatment, and no marker, keeping Item's inline inset.                                                                                                                                                                                                                                                                                                                       | Current source and tests |
| FR4 | In a List whose `listStyle` is `disc`, `circle`, or `decimal`, the row draws that marker before its content: a disc or circle shape, or a counter number. A task state set for the row draws a read-only, labelled checkbox in the marker's place. Each marker and the task checkbox sit on the label's first line. A List whose `listStyle` is `none` draws neither. Other markers, set internally for Markdown's nested lists, are uncontracted here. | Current source and tests |
| FR5 | The row carries `component:List`'s `list-item` target, merged with the caller's `className` and `style`; `xstyle` applies after ListItem's own styles.                                                                                                                                                                                                                                                                                                  | Current source           |

### Allowed variation

- **AV1 — Row content.** Label, description, and slot content vary.
- **AV2 — Theme styling.** Themes restyle `list-item`.

### Representative states

| State                | Required invariant                               | Allowed variation |
| -------------------- | ------------------------------------------------ | ----------------- |
| Static row in a List | One `<li>`; no button or anchor.                 | Content.          |
| Interactive row      | Item's invisible button or anchor; one tab stop. | Content.          |
| Divided list         | A divider between rows; square corners.          | Density.          |
| Numbered list        | A counter number before each row.                | Number style.     |
| Task row             | A read-only checkbox in the marker's place.      | Checked state.    |
| Row outside a List   | Item's inline inset; no marker.                  | Content.          |

### Transformation and precedence order

- **ORD1 — Marker.** No marker when the List's `listStyle` is `none`; otherwise
  a task checkbox when the row has a task state, then the marker.
- **ORD2 — Styling.** ListItem's own styles, then the caller's `xstyle`.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — List semantics.** Inside a List, each row is an `<li>` in the List's
  `<ul>` or `<ol>` (FR1).
- **AR2 — Row semantics.** Item's interaction, disabled, and selected semantics
  apply unchanged; they are Item's shipped behavior, uncontracted here.
- **AR3 — Task state.** A task row's checkbox is read-only and labelled (FR4).

## Design relationships

| Anatomy or state | Design requirement                              | Representation authority | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Row              | Presents one list entry through Item.           | `component:Item`         | Prominent      | FR1, FR5           |
| Marker           | Shows the list's bullet, number, or task state. | Current source           | Supporting     | FR4                |

No anatomy-theming map is recorded yet; the block is optional during
migration, so the map is deferred.

## Family and system relationships

- `component:Item` owns `align`, the start and end content's alignment; its
  other row behavior is
  uncontracted. `spec:AST-057` owns swipe actions and
  `family:navigation-destinations` owns link destinations.
- `component:List` owns the edge treatment and its row geometry and inset;
  its record leaves the density, divider, and marker-style settings
  uncontracted, and FR2 and FR4 here cover what a row does with them.
- `architecture:component-theming-surface` owns target qualification;
  `component:List` owns the `list-item` target, and FR5 covers how the row
  applies it.

## Verification map

| Contract | Verification                                                                     | Representative states                          | Mutation or failure expectation                        | Audit section                  |
| -------- | -------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------ | ------------------------------ |
| FR1, AR1 | `List.test.tsx` row element, align, data attribute, and swipe pass-through tests | Static and interactive rows                    | A row that is not an `<li>`, or a dropped prop, fails. | `audit:ListItem/behavior`      |
| FR2      | `List.test.tsx` density, divider, radius, and edge treatment tests               | Each density; dividers on and off; each edge   | A row that ignores its List's settings fails.          | `audit:ListItem/layout`        |
| FR3      | `List.test.tsx` "keeps the inset of a ListItem outside a List"                   | Row outside a List                             | A row outside a List that loses its inset fails.       | `audit:ListItem/layout`        |
| FR4, AR3 | `List.test.tsx` marker and ListMarkerScope tests                                 | Presence of a marker, none, scope marker, task | A missing, extra, or unlabelled marker fails.          | `audit:ListItem/anatomy`       |
| AR2      | `List.test.tsx` invisible button, anchor, disabled, and selection tests          | Click, href, disabled, selected                | Lost row semantics fail.                               | `audit:ListItem/accessibility` |

Read from source, with no focused test yet:

- FR1: `interactiveRef`, `rel`, and `ref` reaching the Item row.
- FR2: the divider border and square corners.
- FR4: each marker and the task checkbox sitting on the label's first line.
- FR3: `balanced` density, no dividers, and no marker outside a List.
- FR4: the shape of each bullet marker (the disc's fill, the circle's ring),
  and the number marker and its counter.
- FR5: the `list-item` target, and `xstyle` applying after ListItem's styles.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, Item's row behavior, or
List's edge and geometry rules. It links to their owners.
