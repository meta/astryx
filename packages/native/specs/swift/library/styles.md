# SwiftUI styles (Swift)

- Status: draft
- Relation: extends `packages/native/specs/swift/library/component-api.md`,
  reads the theme as `packages/native/specs/swift/library/theme-environment.md`
  says, and applies AST-093 FR2 (native-first: a component sits on the platform's
  own control). It decides how Astryx's look reaches SwiftUI's own controls.

## Summary

An app that already uses SwiftUI's buttons, toggles, and progress views can
adopt Astryx's look one control at a time, with
`.buttonStyle(.astryx(variant: .primary))`, instead of replacing whole
screens. The person using the app keeps the system controls' accessibility and
behavior, now in the brand. Astryx's own views are built on the same styles,
so a theme change reaches both.

## Requirements

- **Y1 — Astryx looks as SwiftUI styles.** For each component whose core
  contract matches a SwiftUI control whose style protocol accepts a custom
  conformance, Astryx ships a conformance to that control's style protocol, with only the component's core visual props as parameters. A protocol that
  styles one component reaches it as `.astryx` (`ButtonStyle`, `LabelStyle`,
  `MenuStyle`, `GroupBoxStyle`, `LabeledContentStyle`, `ControlGroupStyle`);
  one that styles several reaches each as `.astryx<Component>` (`.astryxSwitch`,
  `.astryxCheckbox`, `.astryxProgressBar`, `.astryxSpinner`). Each style reads the theme from the
  environment. The component's view is the SwiftUI control with that style,
  plus the contract's behavior props. Astryx declares no style protocol of its
  own.
- **Y2 — Styles are look-only.** A style's parameters are the component's core
  visual props (such as `variant`, `size`, and `elevation`), with the generated
  types and defaults. Behavior props (such as `isLoading`, `disabledMessage`,
  `tooltip`, and `href`) are never style parameters; they stay on the view.
- **Y3 — The styles.**

  | SwiftUI style         | Member                                      | Astryx look                                                                                                               |
  | --------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
  | `ButtonStyle`         | `.astryx(variant:size:elevation:)`          | Button, IconButton; also SwiftUI's own `Link`, `NavigationLink`, and `ShareLink`, which SwiftUI styles with `ButtonStyle` |
  | `ToggleStyle`         | `.astryxSwitch`; `.astryxCheckbox` on macOS | Switch; CheckboxInput                                                                                                     |
  | `ProgressViewStyle`   | `.astryxProgressBar`; `.astryxSpinner`      | ProgressBar (determinate or not); Spinner                                                                                 |
  | `LabelStyle`          | `.astryx`                                   | the icon-and-label layout of Button and Badge                                                                             |
  | `MenuStyle`           | `.astryx`                                   | DropdownMenu trigger (menu contents stay system)                                                                          |
  | `GroupBoxStyle`       | `.astryx`                                   | Card                                                                                                                      |
  | `LabeledContentStyle` | `.astryx`                                   | Field: a label beside or above its control                                                                                |
  | `ControlGroupStyle`   | `.astryx`                                   | ButtonGroup                                                                                                               |

  `PickerStyle` and `TextFieldStyle` accept no custom conformance, so Selector and TextInput use the system styles and take the theme's
  tint and text colors from the theme environment. A component added later
  joins this table when its core contract matches a SwiftUI control whose
  style protocol accepts a custom conformance.

- **Y4 — Style types keep the prefix.** A style's type is
  `Astryx<Control>Style` (`AstryxButtonStyle`), because the unprefixed name is
  SwiftUI's own protocol; callers reach it through its Y3 static member and do not write
  the type.
- **Y5 — Accessibility comes from the system control.** A style draws only;
  the control keeps its name, traits, actions, and focus. `ToggleStyle` is the
  exception: a custom toggle style draws the control and flips its on state
  itself, so the Astryx toggle styles also keep the toggle trait and its
  on/off value for VoiceOver and act on a tap or the default action. A stock control
  styled with `.astryx` gets the look and not the view's behavior contract
  (for example, loading announced once).

## Acceptance checks

| Requirement | Check                                                                                                                                                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Y1          | A compile test applies every Y3 style to its SwiftUI control through its Y3 member; a source check finds no public protocol declared by Astryx whose name ends in `Style`.                                                                                                                     |
| Y1          | A capture test draws `SwiftUI.Button("x") {}.buttonStyle(.astryx(variant: .primary))` and `Button("x", variant: .primary) {}` identically in two themes, light and dark. `SwiftUI.Link`, `NavigationLink`, and `ShareLink` with `.buttonStyle(.astryx(variant: .primary))` draw the same look. |
| Y2          | A source check finds no style parameter that is not a core visual prop of its component.                                                                                                                                                                                                       |
| Y3          | Each component in the Y3 table has its style; Selector and TextInput inside a theme draw the theme's tint.                                                                                                                                                                                     |
| Y5          | Accessibility assertions for a styled stock control equal those for the same unstyled stock control. A `Toggle` with `.astryxSwitch` reads as a toggle with its value and flips on a tap and on VoiceOver's default action.                                                                    |

## Current state

- On `main`, the Swift package `packages/native/apple` holds generated props,
  the wire, and the logic host. There are no SwiftUI views or styles.

## Open questions

None.

## References

- `ButtonStyle`: https://developer.apple.com/documentation/swiftui/buttonstyle
- `ToggleStyle`: https://developer.apple.com/documentation/swiftui/togglestyle
- `ProgressViewStyle`: https://developer.apple.com/documentation/swiftui/progressviewstyle
- `LabelStyle`: https://developer.apple.com/documentation/swiftui/labelstyle
- `MenuStyle`: https://developer.apple.com/documentation/swiftui/menustyle
