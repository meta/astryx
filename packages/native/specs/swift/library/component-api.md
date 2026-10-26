# Component API (Swift)

- Status: draft
- Relation: extends AST-093 FR1 and FR5, and AST-082 FR3, FR4, FR5, FR7, FR8.
  It decides how one SwiftUI view exposes its component's generated contract.

## Summary

An iOS developer writes `import Astryx`, then
`Button("Save", variant: .primary) { save() }`, or
`Astryx.Button(…)` in a file that also imports SwiftUI. It reads like SwiftUI's own
`Button`, autocompletes the same prop names as the web, and rejects a value the
contract does not allow. The person using the app gets the same words, states,
and behavior the web gives them, because every Swift view is driven by the
same generated contract.

## Requirements

- **A1 — Core names, in a module named `Astryx`.** The library product and
  the Swift module that holds the views are both named `Astryx`. A component's
  SwiftUI view has the core component's name, unprefixed (`Button`, `Text`,
  `Card`), conforms to `View`, and lives in the component's own folder. The
  same rule names the theme types (`Theme`, `Tokens`) and the generated
  contract types (`ButtonProps`, `ButtonVariant`). The generated wire types
  that drive views from a logic core (`AstryxNode`, `AstryxAction`,
  `AstryxBaseProps`) have no core name and keep theirs. The module
  re-exports SwiftUI and the generated contracts, so `import Astryx` is the
  only import an app file needs. No type inside the module is named `Astryx`, so the
  module-qualified name always resolves.
- **A1a — Two spellings, one view.** `Button(…)` and the module-qualified
  `Astryx.Button(…)` name the same view.
  - In a file that imports `Astryx` and not SwiftUI, an unqualified shared name
    (A1b) means Astryx's type, because SwiftUI reaches that file only through
    Astryx's re-export. The system type is written `SwiftUI.Button`.
  - In a file that also imports SwiftUI directly, or another module that
    declares the same name, the file writes `Astryx.Button` and
    `SwiftUI.Button`. There, Swift rejects an unqualified shared name in a type
    position as ambiguous. A call resolves by overload ranking instead: a
    string-literal call that both modules' initializers accept resolves to
    Astryx's view without error, because a string literal's default type
    `String` ranks above SwiftUI's `LocalizedStringKey`, and a call that only
    one module's initializer accepts compiles against that module. So for
    calls the qualifier is this rule, not a compiler error.
  - Documentation and examples write `Astryx.Button` wherever SwiftUI's view of
    the same name appears in the same file.
- **A1b — Package code always qualifies system views.** Inside the `Astryx`
  module, an unqualified name means the Astryx type, so every use of a SwiftUI
  type that Astryx also names is written with its own module. The Astryx
  names visible under `import SwiftUI` today are `Button`, `ContextMenu`,
  `Divider`, `Grid`, `Layout`, `Link`, `List`, `Section`, `Slider`, `Stepper`,
  `Tab`, `Table`, `TableRow`, and `Text` (written `SwiftUI.<Name>`), `Calendar` and `Timer` (written `Foundation.<Name>`), and
  `Selector` (written `ObjectiveC.Selector`); a new component whose name any of
  those modules declares joins this list.
- **A1c — Modifiers keep the prefix.** View modifiers live on SwiftUI's `View`
  and share one namespace with every other library, so they are prefixed:
  `.astryxTheme(_:)`.
- **A2 — The contract is the parameter list.** Every core prop and every
  platform prop of the generated `<Name>Props` for the platform being built
  (`ios` on iOS, `macos` on macOS, such as Selector's `menuStyle`) is a
  parameter of the view with the same name, the same generated type, and the
  same default. The core contract holds only props every platform honors
  (AST-082 FR3), and each one keeps its full meaning on every Apple device,
  adapting per device where the device differs; a prop is never accepted
  without that meaning (`architecture:public-component-api` INV2). A prop only
  one platform can honor is that platform's prop, such as Switch's `size`,
  which only macOS can honor with the system switch. Switch's `labelPosition` and
  `labelSpacing` are absent from the Apple contracts: an Apple switch row follows the system toggle
  layout, the label leading, the switch trailing, and the system's spacing
  between them. A `content` slot, which `<Name>Props` leaves out, is a
  parameter of both initializers instead: the labeled one takes it as a
  `@ViewBuilder` closure and the props one as the slot's generated node type
  (A3, A4). The view
  imports the generated contract types and never declares its own copy of a
  generated enum. A prop the contract lacks is never added in Swift; it is a
  contract gap.
- **A3 — Two ways in, one meaning.** The view has an initializer that takes
  `<Name>Props`, for generated and wire-driven callers, and a SwiftUI-style
  initializer with labeled parameters. Both take every content slot, the
  labeled one as a `@ViewBuilder` closure and the props one as the slot's
  generated node type, as `packages/native/specs/swift/library/slots.md` says,
  and both build the view from the same `<Name>Props` values; the view's `body`
  reads only those values and slots. The two initializers are one API in two Swift
  spellings (`architecture:public-component-api` INV21): the labeled one
  builds the props the other takes.
- **A4 — SwiftUI shapes for SwiftUI concepts.**
  - The component's main word comes first and unlabeled, as in `Button` and
    `Text`.
  - A `content` slot (AST-082 FR4, with its amendment that lets a platform
    accept a wider form for a content slot) is a generic `@ViewBuilder`
    closure parameter that accepts any view, as
    `packages/native/specs/swift/library/slots.md` says, never `AnyView`. A
    `text` slot is words, a `String` field of `<Name>Props` (A5), and an `icon`
    slot is an `IconName` field.
  - Parameters without defaults come before those with defaults, except a
    required action, which comes last so it can be a trailing closure.
  - A prop whose native form is a different SwiftUI control switches the
    control: with `href` set, Button, Avatar, and Item draw a SwiftUI `Link`, so the system opens it and VoiceOver reads it as a
    link. Each keeps its own look: Button through the Astryx button style,
    Avatar and Item as they draw without `href`. Disabled follows core: a
    disabled Button with `href` draws its disabled button, not a link, as core
    draws a disabled `<button>`; a disabled Item with `href` stays a link that
    VoiceOver reads as dimmed and that does not open, as core keeps a disabled
    link; Avatar has no disabled state.
- **A5 — Words and values take the contract's types.** A word prop is the
  contract's `String`, and a value prop and its change callback are the
  contract's two parameters, as AST-093 FR5 requires. A localizable spelling
  for words and a `Binding` spelling for values are OQ1.
- **A6 — No styling parameters beyond the contract.** The contract's own visual
  props (such as `color`, `padding`, and `elevation`) are parameters as A2
  says. A view adds no visual parameter the contract lacks (no SwiftUI
  `Color`, `Font`, `CGFloat` padding, corner, or shadow parameter) and no
  public `*Style` protocol; everything else visual comes from the theme
  (AST-082 DEC-2). Layout around the component stays with the caller's own
  modifiers.
- **A7 — Base props map once.** `id` becomes `accessibilityIdentifier` and
  `isHidden` removes the view from layout and the accessibility tree, on the
  part the contract's `baseTarget` names (AST-082 FR7).
- **A8 — Every public declaration has a one-sentence doc comment** that names
  the core prop it maps to where one exists; a declaration with no core prop
  (an initializer, a content slot, a style or modifier) names the contract
  part it serves.
- **A9 — Layout SwiftUI already provides is not offered.** The Swift public
  API offers no HStack or VStack view; apps use SwiftUI's own stacks with
  token spacing (`theme.space.s4`). A logic-core tree on an Apple host keeps
  its `HStack` and `VStack` wire nodes (AST-082 FR19), which the logic host
  draws with SwiftUI's stacks.

## Acceptance checks

| Requirement | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1          | The package manifest names the library product and module `Astryx`; a source check finds no type named `Astryx` in it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| A1a         | A compile test with two app files: one importing only `Astryx` checks that `let a: Button = Button("x") {}` is `Astryx.Button` and `SwiftUI.Button("x") {}` is SwiftUI's; one importing SwiftUI and `Astryx` checks that `Astryx.Button` and `SwiftUI.Button` both resolve, that `let t: Text` does not compile there (ambiguous in a type position), that `let a = Text("x")` compiles there and `let _: Astryx.Text = a` then type-checks (a string-literal call both initializers accept resolves to Astryx's), and that a call only Astryx's initializer accepts, `Button("x", variant: .primary) {}`, compiles as `Astryx.Button`. |
| A1b         | A source check fails when a file in the module uses a name from the A1b list without its module qualifier where it means the system type.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| A1c         | A source check finds no public `View` extension member without the `astryx` prefix.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| A2          | A source check fails when a components file declares an `enum` with the same cases as a generated enum, or a public parameter that is neither a prop of the generated `<Name>Props`, the `<Name>Props` value itself, nor a content slot of the contract.                                                                                                                                                                                                                                                                                                                                                                                |
| A2          | A compile test builds every view from its generated `<Name>Props` with every prop set, plus each content slot's generated node type, and through the labeled initializer with a builder for each content slot, on iOS and on macOS. A source check finds no parameter that a view accepts and ignores; Switch's `size` exists on macOS only.                                                                                                                                                                                                                                                                                            |
| A3          | A test builds a view through each initializer with the same arguments and finds every `<Name>Props` field the same in both, comparing callbacks by invoking them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A4          | `AnyView` does not appear in the components module. An enabled Button with `href` is a `Link` in the view tree and reads as a link to VoiceOver; a disabled Button with `href` reads as a dimmed button; an Avatar with `href` draws the same as without it. A disabled Item with `href` reads as a dimmed link and does not open.                                                                                                                                                                                                                                                                                                      |
| A5          | The A2 source check passes: no public parameter outside the generated `<Name>Props` and the contract's content slots.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| A6          | A source check finds no public SwiftUI `Color`, `Font`, `CGFloat` padding, or `*Style` parameter on a component; the contract's own visual props are allowed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| A7          | A UI test finds the view by its `id` and does not find it when `isHidden` is true.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A8          | DocC builds with no missing-documentation warning for a public component symbol.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| A9          | The `Astryx` product declares no public `HStack` or `VStack` view; the logic host draws `HStack` and `VStack` wire nodes with SwiftUI's stacks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| A2          | The Swift Switch view takes no `labelPosition` or `labelSpacing` parameter, and a capture shows its row with the label leading and the switch trailing, in light and dark and at the largest text size.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Current state

- `packages/native/apple/` is one Swift package with the `Astryx` product
  (SwiftUI views with core's names, `Button`, `Text`, and so on, re-exporting
  SwiftUI and the contracts) and the `AstryxNative` product (generated contract
  types, unprefixed: `ButtonProps`, `ButtonVariant`).
- Avatar, AvatarStatusDot, Card, Heading, Icon, Text, and Thumbnail take their
  generated `<Name>Props`; Button and
  TextInput still take hand-written parameters until each moves onto its
  generated props; Banner has no generated contract.
- `AstryxNodeView` draws Avatar (with its status dot), AvatarStatusDot, Card,
  Heading, Icon, Text, and Thumbnail wire nodes. Any other
  node, HStack and VStack included, renders in its place as unsupported, and
  its siblings still render, until the logic host draws stacks (A9).
- The generated iOS `SwitchProps` still declares `size`, and `HStackProps` and
  `VStackProps` are still generated for iOS and macOS.

## Open questions

- **OQ1 — Should AST-093 FR5 allow SwiftUI spellings that map to contract
  types?** FR5 requires parameters "named and typed as the generated
  contract", so a `LocalizedStringResource` spelling for words and a `Binding`
  spelling for a value and its change callback are not allowed today.
  Recommendation: amend AST-093 FR5 to allow additional spellings that convert
  to exactly the contract's type, because every SwiftUI control takes words and
  values this way; the amendment changes a record outside `packages/native/`
  and is decided there.
- **OQ2 — Do Swift callers see the web callback names?** Recommendation: the
  labeled initializer takes the action as an unlabeled trailing closure, as
  SwiftUI does; the `<Name>Props` initializer keeps `onClick`.

## References

- Swift API Design Guidelines: https://www.swift.org/documentation/api-design-guidelines/
- SwiftUI `Button`: https://developer.apple.com/documentation/swiftui/button
- `LocalizedStringResource`: https://developer.apple.com/documentation/foundation/localizedstringresource
- WWDC24, SwiftUI essentials: https://developer.apple.com/videos/play/wwdc2024/10150/
- WWDC21, Demystify SwiftUI (identity and `AnyView`): https://developer.apple.com/videos/play/wwdc2021/10022/
