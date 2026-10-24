# Swift library specs

Rules that every Astryx Swift component or Swift build step shares, one
concern per file. A component spec (`<Name>.spec.md` in the component's own
folder, such as `apple/Sources/Astryx/Button/Button.spec.md`, from
`../../TEMPLATE.md`) follows these and records only where a component differs.

These specs apply AST-082 (native-first surfaces) and AST-093 (native component
guidelines). Where one of them and an approved record disagree, the record
wins.

| File                      | Concern                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `accessibility.md`        | How core's accessibility semantics reach VoiceOver and Apple's accessibility settings |
| `augmentable-variants.md` | How a theme's own variants reach Swift as open types                                  |
| `component-api.md`        | How a SwiftUI view is named and takes its generated contract                          |
| `slots.md`                | How each slot kind (text, icon, content) appears in SwiftUI                           |
| `styles.md`               | How Astryx's look ships as SwiftUI styles                                             |
| `theme-environment.md`    | How the theme rides on SwiftUI's environment in both directions                       |
| `theme-generator.md`      | How any Astryx theme becomes a Swift `Theme`                                          |
