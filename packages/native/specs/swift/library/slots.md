# Typed slots (Swift)

- Status: draft
- Relation: applies AST-082 FR4
  (`docs/specs/AST-082-native-first-surfaces/spec.md`: typed slots, text,
  icon, and content, and a platform's wider form for a content slot with the
  same meaning), and FR17 (shared icon names) to Swift. It decides how each slot kind appears in
  SwiftUI; it does not define the kinds.

## Summary

An iOS developer can put an icon in a button, an avatar at the start of a list
row, or any SwiftUI view at its end, the way SwiftUI's own `Label` takes an
icon view, and the component still sizes and orders what it holds, so every
row lines up and reads the same way. Icons are always ones the platform can
draw. The person using the app sees the same parts in the same
places as on the web, read by VoiceOver in the same order.

## Requirements

- **S1 — Each AST-082 slot kind has one Swift form.**
  - A **text** slot is a `String`, the contract's exact type (AST-093 FR5). A
    localized text spelling is outside this record.
  - An **icon** slot is an `IconName` (S2).
  - A **content** slot accepts any SwiftUI view, through a `@ViewBuilder`
    closure (S3). The core's content slot holds named Astryx components; Swift
    accepts this wider form under AST-082 FR4, which lets a platform accept a
    wider form for a content slot with the same meaning, as the web
    accepts a React node. The component's native additions still name the Astryx
    components the core slot holds, and whether it holds one or many (a list item's `startContent` holds one of `Icon`, `Avatar`, or `CheckboxInput`; a card holds many).
    Text and icon slots take no wider form (no attributed text, no image), so
    they mean the same thing on Swift as in the core; a localized text
    spelling stays outside this record, as above. A free-form web
    prop with no slot kind stays in the web contract only.
- **S2 — Icon names are a string-backed type with the built-ins as members.**
  `IconName` is a `RawRepresentable`, `ExpressibleByStringLiteral`,
  `Hashable`, `Codable`, `Sendable` value. Every built-in semantic name is a
  static member (`.search`, `.close`), generated from AST-082 FR17's shared
  icon names, read at build time through the icon-names read AST-082 FR16 lists
  (later through core's portable entry), never from core's web icon registry. A
  namespaced name (`"acme:rocket"`) is valid once the theme maps it to an
  image. `Theme(icons:)` maps a shared or namespaced name to an `IconImage`:
  `.systemName(_:)` for an SF Symbol, or `.assetName(_:)` for an image in the
  app's asset catalog, as AST-082 FR17 names a native icon by `systemName` or
  `assetName`; a string literal is an SF Symbol name. An unknown name, or an
  asset the app does not ship, stops a development build with a message
  naming it, and draws nothing in a release build, never a substitute.
- **S3 — Content slots are open, the SwiftUI way.** A content slot is a generic
  `@ViewBuilder` closure parameter named as the core prop
  (`startContent: () -> StartContent` where `StartContent: View`), as in
  SwiftUI's `Label { } icon: { }`, never `AnyView`. For
  each Astryx component the core slot names, the view also has a convenience
  initializer that takes that component's props directly (for example a row's
  `startContent: AvatarProps`). The props initializer takes the slot as the matching
  generated node type.
- **S4 — The owner sizes what it holds.** A component proposes the size of
  each slot from its own size and clips or aligns what the slot draws to it,
  whatever view is in it. An Astryx child inherits its owner's size only where
  core's does: an `Icon` in an owner's documented icon slot (an `Icon` in a
  small `IconButton` is small), and a child of a component whose contract
  adopts the size cascade. Every other child keeps its own default (an unsized `Avatar` in a list item
  stays `md`). An explicit size on a child wins wherever core's does, and a
  component that sizes its members in core keeps doing so: core's `AvatarGroup`
  sets every member `Avatar`'s size, explicit or not.
- **S5 — Reading order follows the slots.** VoiceOver reads a component's slots
  in the core contract's order (for a list item: `marker`, `startContent`,
  `label`, `description`, `endContent`), whatever views they hold. A decorative
  icon in a slot is hidden unless it carries a label (AST-082 FR17).
- **S6 — Slots are declared, not guessed.** Each component's native additions
  name the slot kind, and for a content slot the Astryx components the core
  slot holds, for every free-form prop it keeps; the contract generator fails
  when a kept free-form prop has none.

## Acceptance checks

| Requirement | Check                                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1, S6      | The generator test fails on a fixture component that keeps a free-form prop with no slot kind, or keeps a content slot that names no components; a fixture's unkept free-form prop stays web-only with no Swift form; a fixture with all three kinds produces each Swift form. |
| S2          | Every built-in name maps to an SF Symbol that exists on the package's iOS floor; registering `acme:rocket` makes `"acme:rocket"` draw it; an unregistered name stops a development build and draws nothing in release.                                                         |
| S3          | A compile test passes `Avatar(…)` into a list item's `startContent` through the closure, through the `AvatarProps` convenience initializer, and a plain SwiftUI `Image` through the closure; `AnyView` does not appear in the components module.                               |
| S4          | A test reads the resolved size of an unsized icon in a small and a large owner's icon slot, finds an unsized `Avatar` in a list item at `md`, and finds the drawn bounds of an oversized SwiftUI view in `startContent` within the slot.                                       |
| S5          | A UI test reads a list item with a marker, `startContent`, label, description, and `endContent` in that order, with an Astryx badge and with a plain SwiftUI text in `endContent`.                                                                                             |

## Current state

- The contract generator knows two slot kinds, `text` and `content`; an icon
  prop has no portable form, so the icon props of Button and Badge are
  web-only.
- The built-in icon names map to SF Symbols in TypeScript only.

## Open questions

None.

## References

- HIG, SF Symbols: https://developer.apple.com/design/human-interface-guidelines/sf-symbols
- `ViewBuilder`: https://developer.apple.com/documentation/swiftui/viewbuilder
- SwiftUI `Label` (open icon slot): https://developer.apple.com/documentation/swiftui/label
