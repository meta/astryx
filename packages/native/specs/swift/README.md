# Swift specs

Rules shared by every Astryx component written in Swift, for iOS and macOS, as
architecture records (`architecture:native-swift-<slug>`), one concern per
file. A component spec follows these and records only where its component
differs. Each is a knowledge record, governed like any other; all are current
except `tooltip.spec.md`, which is a draft.

| File                           | Concern                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `accessibility.spec.md`        | How core's accessibility semantics reach VoiceOver and Apple's accessibility settings |
| `augmentable-variants.spec.md` | How a theme's own variants reach Swift as open types                                  |
| `component-api.spec.md`        | How a SwiftUI view is named and takes its generated contract                          |
| `slots.spec.md`                | How each slot kind (text, icon, content) appears in SwiftUI                           |
| `styles.spec.md`               | How Astryx's look ships as SwiftUI styles                                             |
| `tooltip.spec.md`              | How core's tooltips reach pointer, keyboard, touch, and VoiceOver (internal)          |
| `theme-environment.spec.md`    | How the theme rides on SwiftUI's environment in both directions                       |
| `theme-generator.spec.md`      | How any Astryx theme becomes a Swift `Theme`                                          |

A single component's spec lives beside the core component's spec:
`docs/specs/components/<ComponentRoot>/<Name>.swift.spec.md`, named as the core
component (`Button.swift.spec.md`, `TextInput.swift.spec.md`). See
[`../README.md`](../README.md). Start with a component that already has a
generated contract in `packages/native/src/components/`.
