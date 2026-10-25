# Astryx for Apple platforms

> **Experimental. Canary only.** Part of `@astryxdesign/native`. APIs change
> without notice.

One Swift package with two products:

- **`Astryx`**: SwiftUI views painted with the theme's tokens, the theme
  environment, and core's localized messages. It is arm A of the AST-082
  experiment (pure native: platform views painted with Astryx's tokens).
- **`AstryxNative`**: contract types generated from core's component
  documentation, the wire a TypeScript logic core sends, and the logic host
  that runs one (arm C).

Page templates built from the views are a separate package with no products,
because templates are clone-only and never published.

## Layout

```text
apple/
├── Package.swift          # products Astryx and AstryxNative
├── Sources/
│   ├── Astryx/            # SwiftUI views (module Astryx)
│   │   ├── Theme/         # tokens, the theme environment, Dynamic Type
│   │   │   └── Generated/ # typed tokens and every published theme, generated; do not edit
│   │   ├── Resources/     # core's messages per locale, generated; do not edit
│   │   ├── Localization/
│   │   ├── Icon/          # Icon, Icon.spec.md
│   │   ├── Text/          # Text
│   │   ├── Heading/       # Heading
│   │   ├── Button/        # Button
│   │   ├── TextInput/     # TextInput
│   │   ├── Card/          # Card
│   │   └── Banner/        # Banner
│   └── AstryxNative/      # contracts, wire, logic host (module AstryxNative)
│       └── Generated/     # generated; do not edit
├── Tests/
│   ├── AstryxTests/
│   └── AstryxNativeTests/
└── Templates/             # page templates to copy; its own package, never published
    ├── Package.swift      # no products; compiles and tests the templates
    ├── Login/             # LoginTemplate, from `astryx template login`
    └── Tests/
```

- **`Sources/Astryx/<Name>/`** holds one folder per component, named as in
  `packages/core/src/<Name>/`. Each view has core's component name in the
  `Astryx` module (`Button`, `Text`), which re-exports SwiftUI and the
  generated contracts, so an app file writes `import Astryx` alone. In a file
  that also imports SwiftUI, write `Astryx.Button` and `SwiftUI.Button`. A
  component's parameters use core's prop names
  and values (`variant: .primary`, `size: .lg`, `isLoading`), so code reads
  the same across web and native. `Text`, `Heading`, and `Card` take the
  generated `TextProps`, `HeadingProps`, and `CardProps`, as AST-093 FR5 asks;
  the others keep four exceptions, the interim shape FR5 exempts until they move onto the generated
  contracts:
  - `Button` takes `action` where core has `onClick`.
  - `Button` takes `fillsWidth` where core has `width="100%"`.
  - `Button` takes `icon` as a shared icon name (`"search"`), which the
    generated `ButtonProps` does not carry yet.
  - `TextInput` takes a `Binding` where core has `value` and `onChange`.
- **`Templates/`** holds one folder per page template, named after the
  `astryx template` id. Templates are clone-only, as on the web: you copy a
  template's folder into your app and own it from then on. They are a
  separate package with no products, so nothing imports them, and
  `@astryxdesign/native` leaves them out of its npm package. A template is
  built only from `Astryx` views and SwiftUI layout, and matches the web
  template's content and states. Rules a template needs, such as validation,
  live in a plain value type beside the view so tests can check them without a
  screen.

## Use it

Depend on the `Astryx` product. To start from a template, copy its folder,
such as `Templates/Login/`, into your app's sources; it then belongs to your
app.

```swift
import Astryx

@main
struct DemoApp: App {
  var body: some Scene {
    WindowGroup {
      LoginTemplate().astryxTheme() // copied from Templates/Login/
    }
  }
}
```

`astryxTheme(_:)` paints a subtree with a theme; without it, components use
core's default theme. Either way they follow Dark Mode and the person's text
size.

## Theme tokens

Components read every color, size, and font from the `astryx` environment
value, never from a constant of their own. `astryx.tokens` holds the theme's
tokens in the current mode as typed members (`tokens.color.textPrimary`,
`tokens.space.s4`, `tokens.font.body.size`), so a misspelled token fails to
compile. Font tokens come grouped: each type style (`tokens.font.body`,
`tokens.font.heading1`) holds its `size`, `weight`, and `leading`, and
`tokens.font.family`, `.size`, and `.weight` hold the scales. Text sizes grow with Dynamic Type. The components still read some
tokens by core's name (`astryx.color("color-accent")`); moving them onto the
typed members comes next.

`Icon(.search)` draws a shared icon name as the platform's SF Symbol, at
core's icon size and color, hidden from VoiceOver unless it has a `label`.
`IconName` holds every built-in name as a static member; a theme maps a name
to another symbol or to an image the app ships, or registers a
`<library>:<name>` name, with
`Theme(…, icons: ["acme:rocket": "airplane", "close": .assetName("brand.close")])`.
An asset the app does not ship stops a development build with a message that
names it, and draws nothing in a release build.

Font families come from the theme's `font-family-*` stacks: the first family
the device has wins, and a system family such as `-apple-system` or
`sans-serif` is the system font. Icons use core's shared icon names
(`success`, `warning`, …), drawn as an SF Symbol by default; a theme replaces
one with `Theme(…, icons: ["success": "checkmark.seal.fill"])`.

`Sources/Astryx/Theme/Generated/` is written by the Swift theme generator
(`../specs/swift/library/theme-generator.md`) from core's own resolver, light
and dark:

- `Tokens.swift`: the typed token surface, from core's token names.
- One `<Name>Theme.swift` per theme, declaring `Theme.<name>`: core's
  defaults (`.default`) and every published theme package (`.butter`,
  `.chocolate`, `.gothic`, `.matcha`, `.neutral`, `.stone`, `.y2k`).

```swift
LoginTemplate().astryxTheme(.neutral)
```

Regenerate after a theme or core token change:

```sh
pnpm -F @astryxdesign/native generate:swift-ios
```

A product generates its own theme the same way, from its theme's module and
export:

```sh
node packages/native/scripts/swift-ios-theme.mjs --theme ./src/acmeTheme.ts#acmeTheme --out ./Sources/Theme
```

A theme's local tokens are not generated yet; the generator names each one it
leaves out.

**Fonts.** A theme's font families are carried as data. Astryx never bundles
a font: a component walks the theme's family list in order and uses the first
family the app has registered; a system family in the list (such as
`-apple-system` or `sans-serif`) is the system font, and a list with no
registered family falls back to the system font. To draw a theme's brand face, bundle and register it
in the app. Faces the published themes name (body, heading, code):

| Theme        | Faces to bundle                            |
| ------------ | ------------------------------------------ |
| `.default`   | none (system fonts)                        |
| `.butter`    | Outfit, JetBrains Mono                     |
| `.chocolate` | Albert Sans, Fraunces, JetBrains Mono      |
| `.gothic`    | Fustat, JetBrains Mono                     |
| `.matcha`    | DM Sans, Playwrite US Trad, JetBrains Mono |
| `.neutral`   | Figtree                                    |
| `.stone`     | Figtree, Montserrat, JetBrains Mono        |
| `.y2k`       | Poppins, JetBrains Mono                    |

The same command writes
`Sources/Astryx/Resources/<locale>.lproj/Localizable.strings` from core's
locale catalogs, so words the components speak to assistive technology, such
as a loading button's "Loading", follow the person's language. Tests in
`@astryxdesign/native` fail when either committed output drifts from core.

## Working on it

On a Mac with Xcode or the Swift command-line tools:

```sh
cd packages/native/apple
swift test                 # both products
cd Templates && swift test # templates, against the Astryx product
```

Both packages also declare macOS 14 so they build and test on a Mac without a
simulator; iOS 17 is the target. Open `Templates/Package.swift` in Xcode to
run `LoginTemplate` in an iOS simulator through its preview.

To add a component, create `Sources/Astryx/<Name>/<Name>.swift` declaring
`<Name>` with core's prop names, writing `SwiftUI.<Name>` wherever it means the
system type, read its tokens from `astryx`, and add tests under
`Tests/AstryxTests/`. To add a template, create
`Templates/<Name>/<Name>Template.swift` from the output of
`astryx template <id>`, with tests under `Templates/Tests/`.

## Not here yet

- The views do not use the generated contract types in `AstryxNative` yet.
  Moving them onto those types is how a core prop change reaches Swift.
- Pixel and behavior parity with the web components has not been measured.
- Increase Contrast, theme-local tokens, and platform theme entries
  (`defineNativeTheme`, reserved as `Theme.native`) are not wired in.
