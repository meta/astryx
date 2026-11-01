---
schema_version: 3
template_version: 7
kind: component
id: component:swift/Item
platform_of: component:Item
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/native/apple/Tests/AstryxTests/ItemTests.swift,
    packages/native/src/contract/contracts.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture: []
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# Item (Swift) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Item(_ label:, description:, align:, density:, labelLines:, descriptionLines:, layout:, href:, isHighlighted:, isSelected:, isDisabled:, startContent:, endContent:, marker:, onClick:)` and `Item(_ props: ItemProps, startContent:, endContent:, marker:)`, a generic SwiftUI `View`.                                                                  |
| Behavior                | Draws core's row: marker, start content, the label over or beside its description, end content, with core's density padding, alignment, line limits, and highlighted, selected, and disabled looks. With `href` it is a SwiftUI `Link`; with only `onClick` a SwiftUI `Button`.                                                                           |
| End-user impact         | A person sees list, menu, and settings rows that line up and read like the web's, can tap a whole row, and VoiceOver reads one row in slot order with its selected or dimmed state.                                                                                                                                                                       |
| Builder impact          | Slots take any SwiftUI view through closures; a single trailing closure is the start content. Swipe actions, `target`, `rel`, and `data-testid` have no Swift form.                                                                                                                                                                                       |
| Compatibility/readiness | Additive: a new view and generated `ItemProps`. Draft; built and tested on macOS and the iOS Simulator; device captures are attached to the change.                                                                                                                                                                                                       |
| Review checks           | Reject a slot typed as `AnyView`, a row that draws differently as a link or button, a static row grown to the touch target, a disabled link that opens, colors that are not theme tokens, or a swipe prop the row cannot honor.                                                                                                                           |
| Governing rules         | `spec:AST-082` FR3, FR4, FR7; `spec:AST-093` FR1–FR5; the Swift component API (A2–A4, A7, A9), slots (S1, S3–S5), theme environment, and accessibility (X1, X2, X5, X7) records (`architecture:native-swift-component-api`, `architecture:native-swift-slots`, `architecture:native-swift-theme-environment`, `architecture:native-swift-accessibility`). |

This table is a review projection; the body below is authoritative.

## Intent

Item on Apple platforms is core's row primitive: the shared layout for list
rows, menu rows, and settings rows, drawn with theme tokens and SwiftUI's own
link and button controls.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The row's slot order, spacing, padding per density, and alignment of the
  start and end content against the words.
- Line limits, the label and description type, and the highlighted, selected,
  and disabled looks.
- Switching to a SwiftUI `Link` or `Button` without changing the drawing, and
  the row's accessibility element.

**Does not own / non-goals**

- The meaning of the props — owned by `component:Item`.
- List markers, dividers, and edges — owned by the list that holds the rows.
- What a slot draws: an `Icon`, an `Avatar`, or any view keeps its own size and
  look (Swift slots S4: an unsized Avatar stays `md`).

## Public concepts

| Concept | Closed values or states                   | Meaning                                                                 | Availability by variant/orientation/state | Default    | Owner                  | Stability    | Invalid-value behavior                              |
| ------- | ----------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- | ---------- | ---------------------- | ------------ | --------------------------------------------------- |
| slots   | marker, startContent, endContent          | any SwiftUI view through a `@ViewBuilder` closure                       | always                                    | empty      | `component:Item`       | experimental | none                                                |
| density | `compact`, `balanced`, `spacious`         | block padding of spacing 1, 2, 3; inline padding 2, or 3 when spacious  | always                                    | `balanced` | `component:Item`       | experimental | none                                                |
| align   | `center`, `start`, `firstLine`            | slots centered on the words, at their top, or on the label's first line | always                                    | `center`   | `component:Item`       | experimental | none                                                |
| layout  | `stacked`, `inline`                       | description under or beside the label                                   | with a description                        | `stacked`  | `component:Item`       | experimental | none                                                |
| control | static, link (`href`), button (`onClick`) | how a tap behaves; the drawing is the same                              | always                                    | static     | `component:swift/Item` | experimental | an `href` that is not an absolute URL is not a link |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                                              | Draft review state |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------ |
| FR1 | The row MUST lay out marker, start content, the words, and end content in that order with a gap of `space.s2`, the words taking the remaining width, inside block padding of `space.s1`, `s2`, or `s3` for `compact`, `balanced`, or `spacious` and inline padding of `space.s2`, or `s3` when spacious.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | core `Item` styles                                 | verify             |
| FR2 | The label MUST draw in the body type and `color.textPrimary`, the description in the supporting type and `color.textSecondary`, each limited to `labelLines` or `descriptionLines` lines and truncating after them: one line when unset, and every line for zero, as core's row does. Each line takes the theme's leading, grown with Dynamic Type. With `inline` and a description, the description sits beside the label with a gap of `space.s1` and the label does not shrink; without a description the label keeps its line limit.                                                                                                                                                                                                                                                                                                                          | core `Item` styles                                 | verify             |
| FR3 | `center` MUST center each slot on the words; `start` MUST put each slot's top on the words' top; `firstLine` MUST center each slot on the label's first line.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | core `Item` `align`                                | verify             |
| FR4 | `isSelected` MUST paint `color.accentMuted` behind the row and `isHighlighted` `color.overlayHover`, with selected winning, in the element radius. `isDisabled` MUST draw the words and the end content at half opacity, as core does; the marker and start content keep their own look. A pressed button or link row paints `color.overlayPressed` above its selected or highlighted fill, as core does.                                                                                                                                                                                                                                                                                                                                                                                                                                                         | core `Item` styles                                 | verify             |
| FR5 | With an `href` that is an absolute URL (it has a scheme), the row MUST be a SwiftUI `Link`, and `onClick` does not run. In core the link is the label and a click elsewhere on the row runs `onClick`; a SwiftUI `Link` takes the whole row, so the Swift row has no such area. A script URL (`javascript:`, `vbscript:`) or an HTML document in a `data:` URL MUST leave the row inert, never a link, as core's navigation destinations refuse them (`family:navigation-destinations` FR4). An `href` that is not an absolute URL, such as a web path, MUST stop a development build with a message naming it; a release build draws the row without a link. With only `onClick`, a SwiftUI `Button`. A tappable row is at least 44 points tall; a static row keeps core's height. A disabled link or button stays reachable, reads as dimmed, and does nothing. | Swift component API A4; Swift accessibility X2, X7 | verify             |
| FR6 | Both initializers MUST build the same `ItemProps`. Slots are generic `@ViewBuilder` closures with empty defaults, never `AnyView`; a single trailing closure is the start content and `onClick` comes last. Base props come through `ItemProps`: with `isHidden` the view draws nothing; `id` becomes the accessibility identifier.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Swift component API A2–A4, A7; Swift slots S3      | verify             |

### Allowed variation

- **AV1 — Touch height.** A tappable row is at least 44 points tall, which can
  be taller than core's compact or balanced row.
- **AV2 — Line metrics.** A line's height comes from the theme's leading over
  the system font's own line height, so a custom face can differ by a point.

### Representative states

| State                               | Required invariant                                 | Allowed variation |
| ----------------------------------- | -------------------------------------------------- | ----------------- |
| each density                        | core's block and inline padding                    | none              |
| label and description, both layouts | description under or beside the label              | none              |
| each alignment with a tall slot     | slots centered, at the top, or on the first line   | none              |
| selected, highlighted, disabled     | each look from the theme; selected wins            | none              |
| static, link, button                | the same drawing; tappable rows at least 44 points | AV1               |
| light and dark, two themes          | each theme's colors                                | none              |

### Transformation and precedence order

- **ORD1 — Background.** Selected → highlighted → none.
- **ORD2 — Control.** `href` (link) → `onClick` (button) → static.

### Performance and resources

- **PR1 — No type erasure.** Slots are generic, so the row adds no `AnyView`
  boxing.

## Accessibility contract

- **AR1 — One element per row.** A static row is one element whose label reads
  the slots in order: marker, start content, label, description, end content.
  A link or button row is one link or button element read the same way
  (Swift accessibility X5; Swift slots S5).
- **AR2 — State.** A selected row reads as selected. A disabled row stays in
  the VoiceOver order and reads as dimmed (X1, X2).
- **AR3 — Touch target.** A tappable row is at least 44 points tall (X7).
- **AR4 — Rendered tree not measured.** Tests assert what the view sets; the
  rendered accessibility tree is not measured until an app-hosted target
  exists.

## Design relationships

| Anatomy or state | Design requirement                                 | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Row              | Apple Human Interface Guidelines, Lists and tables | prescribed by core       | supporting     | FR1–FR5            |

The component implements design requirements without copying their rationale.

Platform control: SwiftUI `List` was considered and does not fit: it is a
scrolling container that owns its rows, while core's Item is a row that sits
in any container, including a Card, a Section, or a dialog (`spec:AST-093`
FR2). The row uses SwiftUI `Link` and `Button` for its taps and draws its own
layout. Guideline pages: Lists and tables, Buttons, and Accessibility in the
Apple Human Interface Guidelines.

Theme values read: `space.s1`, `space.s2`, `space.s3`, `radius.element`,
`color.textPrimary`, `color.textSecondary`, `color.accentMuted`,
`color.overlayHover`, `color.overlayPressed`, the body and supporting type, and Dynamic Type.

## Family and system relationships

- `component:Item` owns the props, the slots, and the row's look; this record
  states only how Swift draws them.
- A list owns its rows' markers, dividers, and edges.

## Verification map

| Contract | Verification                                                                                      | Representative states                                                                                | Mutation or failure expectation                                                                                              | Audit section              |
| -------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| FR1, FR2 | `ItemTests.swift` density, leading, line-limit, and largest-text renders                          | each density; one and three label lines; the largest text size                                       | wrong padding, leading, or line limit, or a row that does not grow fails                                                     | `audit:swift/Item/layout`  |
| FR3      | `ItemTests.swift` alignment renders                                                               | `start` and `center` with a description; `firstLine` with a slot taller than one line                | a slot off the words' top, middle, or the label's first line fails                                                           | `audit:swift/Item/align`   |
| FR4      | `ItemTests.swift` background, two-theme, and disabled renders                                     | selected, highlighted, both; neutral, butter; disabled                                               | a wrong token, highlighted beating selected, or an undimmed disabled row fails                                               | `audit:swift/Item/states`  |
| FR5, AR2 | `ItemTests.swift` touch-height renders; tap, trait, `linkURL`, and refused-destination tests      | static, button, link; selected; empty `href`; `javascript:`, `vbscript:`, and `data:text/html` hrefs | a short tappable row, a grown static row, or a missing selected trait fails; a refused destination that becomes a link fails | `audit:swift/Item/control` |
| FR6      | `ItemTests.swift` initializer, trailing-closure, hidden, and wire-slot tests; `contracts.test.ts` | both initializers; each slot; `isHidden`                                                             | differing props, a closure filling the wrong slot, or a drawn hidden row fails; a wire node whose slots do not draw fails    | `audit:swift/Item/api`     |

## Decision log

### DEC-1 — Swipe actions are web-only for now

**Reference:** `component:swift/Item/DEC-1`
**Decider:** cixzhang, 2026-10-31

`swipeActions` has no Swift form. SwiftUI's swipe actions work only on rows
inside a SwiftUI `List`, so an Item anywhere else could not honor them; a
person on iPhone or Mac uses the row's own action or its end content instead.
A Swift form waits until a row can honor swipe actions wherever it sits.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
