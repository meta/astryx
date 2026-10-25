---
schema_version: 5
template_version: 8
kind: component
id: component:swift/Icon
platform_of: component:Icon
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by:
  [
    packages/native/apple/Tests/AstryxTests/IconTests.swift,
    packages/native/src/contract/contracts.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-size-cascade,
    architecture:icon-resolution-and-component-slots,
  ]
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# Icon (Swift) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Icon(_ icon: IconName, color: IconColor? = nil, size: IconSize? = nil, label: String? = nil)` and `Icon(_ props: IconProps)`, a SwiftUI `View` in module `Astryx`. `IconName` is a string-backed name with every built-in name as a static member (`.search`, `.close`). |
| Behavior                | Draws the SF Symbol the theme or the platform maps the name to, in a square box at core's icon size grown with Dynamic Type, in core's icon color token or the surrounding foreground. A name nothing maps draws nothing.                                                 |
| End-user impact         | A person sees the platform's own symbol for each shared icon, sized and colored as on the web, and VoiceOver reads only icons that carry a label.                                                                                                                         |
| Builder impact          | An app passes a shared name (`.search`) or a name it maps in its theme (`"acme:rocket"`). An SVG component, which the web also accepts, has no Swift form.                                                                                                                |
| Compatibility/readiness | Additive: a new view and a new generated `IconName` type. Draft; built and tested on macOS and the iOS Simulator; device captures are attached to the change.                                                                                                             |
| Review checks           | Reject a substitute symbol for an unknown name, an image or attributed-text form of the icon slot, a visual parameter beyond the contract, an unlabeled icon that VoiceOver reads, or an owner's size winning over an explicit `size`.                                    |
| Governing rules         | `spec:AST-082` FR4, FR7, FR17; `spec:AST-093` FR1–FR5; the Swift component API, styles, slots, theme environment, and accessibility records under `packages/native/specs/swift/library/`.                                                                                 |

This table is a review projection; the body below is authoritative.

## Intent

Icon on Apple platforms draws Astryx's shared icon names as SF Symbols, so an
icon beside system controls looks like the platform's own while its size, color,
and accessibility follow the core `Icon` contract.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Resolving a shared icon name to an SF Symbol: the theme's mapping, else the
  platform default.
- Drawing the symbol in a square box at core's icon size, grown with Dynamic
  Type, in core's icon color token.
- The icon's VoiceOver exposure.

**Does not own / non-goals**

- The meaning of `icon`, `color`, `size`, and `label` and the built-in names —
  owned by `component:Icon` and `spec:AST-082` FR17.
- Which size an owner gives the icons in its icon slot — owned by each owning
  component and `architecture:component-size-cascade`.
- The default SF Symbol for each name — owned by `@astryxdesign/native`'s icon
  defaults, which a test keeps equal to the Swift map.

## Public concepts

| Concept       | Closed values or states                                                                                   | Meaning                                                                                | Availability by variant/orientation/state | Default                    | Owner                  | Stability    | Invalid-value behavior                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------- | ---------------------- | ------------ | ----------------------------------------------------------------------- |
| icon name     | the built-in names; a `<library>:<name>` the theme maps                                                   | `IconName`, a string on the wire, with each built-in as a static member                | always                                    | required                   | `component:Icon`       | experimental | an unmapped name stops a development build and draws nothing in release |
| symbol source | theme mapping; platform default                                                                           | `Theme(icons:)` replaces a built-in or registers a library name with an SF Symbol name | always                                    | platform default           | `component:swift/Icon` | experimental | a theme entry wins over the default                                     |
| size          | `xsm`, `sm`, `md`, `lg`; unset                                                                            | 12, 16, 20, 24 points at the default text size                                         | always                                    | owner's icon size, else md | `component:Icon`       | experimental | unset takes the owner's size, then `md`                                 |
| color         | `primary`, `secondary`, `tertiary`, `disabled`, `accent`, `success`, `error`, `warning`, `inherit`; unset | core's icon color tokens; `inherit` keeps the surrounding foreground                   | always                                    | `inherit`                  | `component:Icon`       | experimental | unset is `inherit`                                                      |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                         | Basis                                                       | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------ |
| FR1 | The view MUST draw the SF Symbol the theme's `icons` maps the name to, else the platform default for a built-in name. A name neither maps MUST stop a development build with a message naming it and draw nothing in a release build, never a substitute.                                   | `spec:AST-082` FR17; Swift slots S2                         | verify             |
| FR2 | The symbol MUST fit a square box whose side is core's size in points (12, 16, 20, 24 for `xsm`, `sm`, `md`, `lg`), multiplied by the Dynamic Type scale the theme environment reads.                                                                                                        | core `Icon` sizes; `spec:AST-093` FR3; theme environment E1 | verify             |
| FR3 | The view MUST use its own `size`, else the size its owning component gives icons in its documented icon slot, else `md`.                                                                                                                                                                    | `architecture:component-size-cascade`; Swift slots S4       | verify             |
| FR4 | The view MUST draw in core's token for its `color` — primary and secondary icon tokens, the secondary icon token for `tertiary`, the disabled icon token, and the accent, success, error, and warning colors — and, for `inherit` or no color, MUST keep the surrounding foreground style.  | core `Icon` color map; `spec:AST-093` FR4                   | verify             |
| FR5 | Both initializers MUST build the same `IconProps`; the labeled initializer takes the contract's props with the generated types and defaults, and base props (`id`, `isHidden`) come through `IconProps`. With `isHidden` the view draws nothing; `id` becomes the accessibility identifier. | Swift component API A2, A3, A7; `spec:AST-082` FR7          | verify             |

### Allowed variation

- **AV1 — Glyph shape.** The symbol is the platform's SF Symbol, not the web's
  SVG; a theme may map any name to another SF Symbol.

### Representative states

| State                       | Required invariant                            | Allowed variation            |
| --------------------------- | --------------------------------------------- | ---------------------------- |
| every size                  | box side 12, 16, 20, 24 points at Large text  | glyph proportions per symbol |
| every color, light and dark | the color's token in the current mode         | none                         |
| inside an owner's icon slot | the owner's size unless the icon sets its own | none                         |
| largest text size           | the box grows with Dynamic Type               | none                         |
| labeled and unlabeled       | VoiceOver reads only the labeled icon         | none                         |

### Transformation and precedence order

- **ORD1 — Symbol.** Theme mapping → platform default → nothing.
- **ORD2 — Size.** Explicit `size` → owner's icon size → `md`, then × Dynamic
  Type scale.

### Performance and resources

- **PR1 — No image loading.** The view draws a system symbol by name and holds
  no image data of its own.

## Accessibility contract

- **AR1 — Decorative unless labeled.** With no `label`, or an empty one, the
  view is hidden from VoiceOver. With a label, it is one image element named by
  the label, keeping SwiftUI's image trait and adding none (`spec:AST-082` FR17;
  Swift accessibility X1, X4).
- **AR2 — Rendered tree not measured.** Tests assert what the view sets; the
  rendered accessibility tree is not measured until an app-hosted target exists.

## Design relationships

| Anatomy or state | Design requirement                            | Representation authority   | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Glyph            | SF Symbols (Apple Human Interface Guidelines) | prescribed by the platform | supporting     | FR1, FR2           |

The component implements design requirements without copying their rationale.

Platform control: SwiftUI `Image(systemName:)`. It is the platform's own icon
view and satisfies the contract, so no custom drawing is needed (`spec:AST-093`
FR2). Guideline pages: SF Symbols and Accessibility in the Apple Human
Interface Guidelines.

Theme values read: `color.iconPrimary`, `color.iconSecondary`,
`color.iconDisabled`, `color.accent`, `color.success`, `color.error`,
`color.warning`, the theme's `icons` map, and the Dynamic Type scale.

## Family and system relationships

- `component:Icon` owns the props, the built-in names, the size scale, and the
  color map; this record states only how Swift draws them.
- `architecture:component-size-cascade` owns when an owner's icon size applies;
  owners set it through an internal environment value this view reads.

## Verification map

| Contract | Verification                                                      | Representative states                           | Mutation or failure expectation                                           | Audit section              |
| -------- | ----------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- | -------------------------- |
| FR1      | `IconTests.swift` symbol tests; `contracts.test.ts` IconName test | every built-in; theme replacement; library name | a missing default, a symbol absent on the platform, or a substitute fails | `audit:swift/Icon/symbols` |
| FR2, FR3 | `IconTests.swift` size and Dynamic Type renders                   | each size; owner size; explicit size; AX5       | a wrong side or an owner size beating an explicit size fails              | `audit:swift/Icon/size`    |
| FR4      | `IconTests.swift` color map and two-theme render                  | every color; neutral and butter                 | a wrong token or a color of the view's own fails                          | `audit:swift/Icon/color`   |
| FR5      | `IconTests.swift` initializer and hidden tests                    | both initializers; `isHidden`                   | differing props or a drawn hidden icon fails                              | `audit:swift/Icon/api`     |
| AR1      | `IconTests.swift` accessibility assertions                        | labeled, unlabeled, empty label                 | an unlabeled icon with a label, or a labeled one without, fails           | `audit:swift/Icon/a11y`    |

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — Can a theme map a name to an image the app ships?** (`human-api`)
  Swift slots S2 allows an asset as well as an SF Symbol; `Theme(icons:)` holds
  SF Symbol names only.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
