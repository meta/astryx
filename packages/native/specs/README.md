# Native component specs

One short spec per native component, per language, kept in the component's own
folder beside its implementation, the way core keeps `TabList.spec.md` next to
`TabList.tsx`. The rules live in
[AST-093 (Native component guidelines)](../../../docs/specs/AST-093-native-component-guidelines/spec.md),
which applies [AST-082 (Native-first surfaces)](../../../docs/specs/AST-082-native-first-surfaces/spec.md).

```text
packages/native/
├── specs/
│   ├── TEMPLATE.md            # copy this for a new component spec
│   └── swift/                 # rules shared by every Swift component
│       └── library/           # rules every Swift component or build step shares
└── apple/Sources/Astryx/
    └── <Name>/                # one folder per component, named as core's
        ├── <Name>.swift       # declares <Name> in the Astryx module
        └── <Name>.spec.md     # the component's spec, e.g. Button.spec.md
```

Swift comes first. Kotlin and other languages get their own directory when
their first component starts.

## The three guidelines, in order

1. **Native-first.** Use the platform's own control when it fits the
   component's contract. In Swift: SwiftUI, then UIKit or AppKit. Draw a custom
   control only when the platform has none, and say why in the spec.
2. **Apple Human Interface Guidelines.** On iOS and macOS, presentation and
   interaction follow the HIG: hit targets, Dynamic Type, SF Symbols, materials,
   motion and Reduce Motion, haptics, VoiceOver. Name the pages you follow.
3. **Brand through the theme.** Everything the first two leave open (color,
   type family, shape, spacing, icon choice) comes from the app's theme:
   `defineTheme` tokens and `defineNativeTheme` intent. Never hard-code a
   brand value and never add a visual prop for one platform.

The core contract (prop names, states, words, accessibility semantics) stays
the same everywhere. A native spec never renames or changes it.

## Adding a spec

1. Copy `TEMPLATE.md` to the component's folder as `<Name>.spec.md`, for
   Swift `apple/Sources/Astryx/<Name>/<Name>.spec.md`.
2. Fill every section. Write "None" rather than deleting one.
3. Open a pull request that changes only files under `packages/native/`. A spec
   can land on its own or with the component it describes.

Pull requests that change only `packages/native/`, written entirely by the
native group listed in AST-093 FR6, are approved once required checks pass, the
review app finds no defect on the exact head, and a review against AST-082,
AST-093, and the specs of the components they touch finds every defined
requirement met. Behavior no spec defines does not block; it is recorded as a
spec gap.

## Test and validation

Every native component change ships with the evidence in AST-093 FR5. For
Swift:

```sh
pnpm vitest run --project node packages/native   # contracts, generated code, theme drift
pnpm -F @astryxdesign/native typecheck
cd packages/native/<swift package> && swift build && swift test   # on a Mac with Xcode
```

CI builds and tests every Swift package under `packages/native/` on macOS and
the iOS Simulator. Attach captures of every state, from a simulator or device,
in light and dark and at the largest text size. Anything you could not capture
is reported as not measured.
