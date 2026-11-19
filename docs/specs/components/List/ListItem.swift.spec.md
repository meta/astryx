---
schema_version: 3
template_version: 7
kind: component
id: component:swift/ListItem
platform_of: component:ListItem
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/native/apple/Tests/AstryxTests/ListItemTests.swift,
    packages/native/src/contract/contracts.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture: []
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# ListItem (Swift) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `ListItem(_ label:, description:, align:, href:, isDisabled:, isSelected:, startContent:, endContent:, onClick:)` and `ListItem(_ props: ListItemProps, startContent:, endContent:)`, a generic SwiftUI `View`.              |
| Behavior                | Draws `component:swift/Item` with the density, marker, dividers, and edge of the `List` around it: a dot, a ring, or its number on the label's first line; square corners between dividers; no inline inset in a flush list. |
| End-user impact         | A person sees bulleted and numbered lists, settings lists, and divided lists on iPhone laid out as on the web, with each marker beside its row's first line however the row wraps.                                           |
| Builder impact          | An app puts `ListItem`s in a `List`; the row takes the list's look. Swipe actions, `target`, and `rel` have no Swift form.                                                                                                   |
| Compatibility/readiness | Additive: a new view and generated `ListItemProps`, and internal list hooks on `Item`. Draft; built and tested on macOS and the iOS Simulator; device captures are attached to the change.                                   |
| Review checks           | Reject a marker that leaves the label's first line, a row that ignores its list's density, dividers with rounded corners, an inset in a flush list, or list styling that leaks into rows nested in a slot.                   |
| Governing rules         | `spec:AST-082` FR3, FR4, FR7; `spec:AST-093` FR1–FR5; `component:swift/Item`; the Swift component API, slots, theme environment, and accessibility records under `packages/native/specs/swift/library/`.                     |

This table is a review projection; the body below is authoritative.

## Intent

ListItem on Apple platforms is a row that belongs to a list: it draws as
`Item` and takes the list's density, marker, dividers, and edge, so every row
of a list matches without the app repeating them.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Reading the list around it and handing `Item` its density, marker, inline
  inset, and corners.
- Drawing the marker: a dot, a ring, or the row's number.

**Does not own / non-goals**

- The row's layout, words, states, and taps — owned by `component:swift/Item`.
- Numbering, dividers between rows, and the list's edge — owned by the list
  that holds the rows.
- Swipe actions — web-only for now (`component:swift/Item` DEC-1).

## Public concepts

| Concept | Closed values or states | Meaning                                                          | Availability by variant/orientation/state | Default | Owner                      | Stability    | Invalid-value behavior |
| ------- | ----------------------- | ---------------------------------------------------------------- | ----------------------------------------- | ------- | -------------------------- | ------------ | ---------------------- |
| marker  | none, dot, ring, number | the list's marker for this row, from its list style              | inside a list with a marker style         | none    | `component:ListItem`       | experimental | none                   |
| list    | inside a list; alone    | inside a list the row takes its look; alone it is a plain `Item` | always                                    | alone   | `component:swift/ListItem` | experimental | none                   |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Basis                                      | Draft review state |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------ |
| FR1 | The row MUST draw as `component:swift/Item` with its own label, description, alignment, link, tap, and states, and with the density of the list around it; alone it MUST draw exactly as that `Item`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | core `ListItem`                            | verify             |
| FR2 | In a list with a marker style, the row MUST draw a marker in a column `space.s4` wide, grown with Dynamic Type and the same on every row, before its start content: a 6-point dot filled with `color.textPrimary` for `disc`, a 6-point ring stroked 1 point in `color.textPrimary` for `circle`, or its number and a period in the body type with tabular figures for `decimal`, ending at the column's end so every period in the list lines up, as core's numbered markers do. A number wider than the column reaches into the row's inline inset; a number wider than both widens the column on every row of the list alike, so no number moves its own row's words, overlaps them, or is cut, and every row keeps the list's text edge. The marker's center sits on the center of the label's first line box for every alignment. | core `ListItem` markers                    | verify             |
| FR3 | In a list with dividers the row MUST draw its background with square corners; in a flush list it MUST have no inline inset, so its content and background reach the list's edges.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | core `ListItem` `withDivider`, `edgeFlush` | verify             |
| FR4 | The list's treatment, look, and numbering MUST apply to this row only, not to rows nested in its start or end content.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | core `ListContext` scope                   | verify             |
| FR5 | Both initializers MUST build the same `ListItemProps`. Slots are generic `@ViewBuilder` closures with empty defaults; a single trailing closure is the start content and `onClick` comes last. Base props come through `ListItemProps`. A ListItem node sent by a logic core draws its start and end content nodes in those slots (`spec:AST-082` FR19).                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Swift component API A2–A4, A7; slots S3    | verify             |

### Allowed variation

- **AV1 — Marker drawing.** The dot and ring are SwiftUI shapes at core's size,
  not CSS boxes.

### Representative states

| State                         | Required invariant                            | Allowed variation |
| ----------------------------- | --------------------------------------------- | ----------------- |
| alone                         | the same as `Item`                            | none              |
| in a list: each density       | the list's padding                            | none              |
| disc, circle, decimal markers | on the label's first line for every alignment | AV1               |
| dividers; flush               | square corners; no inline inset               | none              |
| light and dark                | each theme's colors                           | none              |

### Transformation and precedence order

- **ORD1 — Density.** The list's density → `balanced`.

### Performance and resources

- **PR1 — One extra measure.** Inside a list with markers, a centre-aligned row
  measures its words to place the marker on the first line; other rows measure
  nothing.
- **PR2 — Numbering.** Inside a list, the row reports its identity to the list
  once, and the list numbers its rows in the order they appear. A numbered row
  also reports its number's width, from which the list sizes one shared column.

## Accessibility contract

- **AR1 — One row.** The row is the `Item`'s one element; a number marker is
  read first, as part of the row ("3. Mix the batter"); a dot or ring is hidden
  (Swift accessibility X5).
- **AR2 — Rendered tree not measured.** Tests assert what the view sets; the
  rendered accessibility tree is not measured until an app-hosted target
  exists.

## Design relationships

| Anatomy or state | Design requirement                                 | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Row and marker   | Apple Human Interface Guidelines, Lists and tables | prescribed by core       | supporting     | FR1–FR3            |

The component implements design requirements without copying their rationale.

Platform control: none of its own; the row is `component:swift/Item`, which
names the SwiftUI controls it uses (`spec:AST-093` FR2). Guideline pages:
Lists and tables, and Accessibility in the Apple Human Interface Guidelines.

Theme values read: `space.s4`, `color.textPrimary`, the body type, and through
`Item` its tokens.

## Family and system relationships

- `component:swift/Item` owns the row; this record states only what a list
  row adds.
- `component:ListItem` owns the props and markers.

## Verification map

| Contract | Verification                                                                                                                                | Representative states                                                                                                                                                                         | Mutation or failure expectation                                                                                                                                                                                     | Audit section                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| FR1      | `ListItemTests.swift` alone and density renders                                                                                             | alone; compact and spacious lists                                                                                                                                                             | a row that differs from `Item` alone or ignores density fails                                                                                                                                                       | `audit:swift/ListItem/row`    |
| FR2, AR1 | `ListItemTests.swift` number, numbering, column, period-alignment, shared-column, first-line, largest-text, two-theme, and read-aloud tests | decimal; numbering from 3; "1." and "10."; a number wider than the column and inset; "9." at the largest text size; disc with each alignment and at the largest text size; neutral and butter | a missing or wrong number, periods that do not line up, a column that widens for a number that fits the inset or does not widen for every row, a marker off the first line, a color of its own, or a read dot fails | `audit:swift/ListItem/marker` |
| FR3      | `ListItemTests.swift` flush and divider renders                                                                                             | padded and flush; with and without dividers                                                                                                                                                   | an inset in a flush list or a rounded corner between dividers fails                                                                                                                                                 | `audit:swift/ListItem/edge`   |
| FR4      | `ListItemTests.swift` nested-row test                                                                                                       | a row in a row's end content                                                                                                                                                                  | a nested row with the list's marker or inset fails                                                                                                                                                                  | `audit:swift/ListItem/scope`  |
| FR5      | `ListItemTests.swift` initializer and wire-slot tests; `contracts.test.ts`                                                                  | both initializers; a wire node with start content                                                                                                                                             | differing props, or a wire node whose slots do not draw, fail                                                                                                                                                       | `audit:swift/ListItem/api`    |

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
