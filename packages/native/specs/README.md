# Native specs

Every native spec is a standard knowledge record
([`architecture:knowledge-contracts`](../../../docs/architecture/knowledge-contracts.md)
INV27). The rules live in
[AST-093 (Native component guidelines)](../../../docs/specs/AST-093-native-component-guidelines/spec.md),
which applies [AST-082 (Native-first surfaces)](../../../docs/specs/AST-082-native-first-surfaces/spec.md).

- **A native component's spec** sits beside the core component's spec in its
  folder under `docs/specs/components/`, so `docs/specs/components/TabList/`
  holds `TabList.spec.md` and `TabList.swift.spec.md` side by side:
  `docs/specs/components/<ComponentRoot>/<Name>.<language>.spec.md`. It is a
  `component` record
  with id `component:swift/<Name>` and `platform_of: component:<Name>`, built
  from
  [`docs/templates/knowledge/component-spec.md`](../../../docs/templates/knowledge/component-spec.md).
  It states only what the platform adds or must do differently; the core
  record keeps the shared contract.
- **Rules shared by a language's components** are architecture records in
  `specs/<language>/<slug>.spec.md`, with id
  `architecture:native-<language>-<slug>`, built from
  [`docs/templates/knowledge/architecture.md`](../../../docs/templates/knowledge/architecture.md).

```text
packages/native/
├── specs/
│   └── swift/                 # rules shared by every Swift component
│       └── <slug>.spec.md     # architecture:native-swift-<slug>
└── apple/Sources/Astryx/
    └── <Name>/                # one folder per component, named as core's
        └── <Name>.swift       # declares <Name> in the Astryx module

docs/specs/components/
└── <ComponentRoot>/           # the folder core keeps the component in
    ├── <Name>.spec.md         # the core contract, component:<Name>
    └── <Name>.swift.spec.md   # component:swift/<Name>
```

Swift comes first. Kotlin and other languages get their own directory when
their first shared rule starts.

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

1. Copy the template for the record's kind from `docs/templates/knowledge/` to
   the location above, and fill its frontmatter and every section.
2. Run the rubric in `docs/contributing/spec-writing.md`.
3. Open a pull request that changes only files under `packages/native/` and
   native specs. A spec can land on its own or with the component it describes.

Pull requests that change only `packages/native/` and native component specs
(`docs/specs/components/**/<Name>.<language>.spec.md`), written entirely by the
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
