---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-082
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
phase: accepted
owners: [cixzhang]
affects_architecture:
  [
    architecture:theme-authoring-contract,
    architecture:theme-compilation,
    architecture:public-component-api,
    architecture:cli-surface,
  ]
affects_families: []
affects_contributing: []
affects_consumer_docs: [theme, cli]
---

# Native-first surfaces system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A person using an Astryx product gets a native-first experience wherever they
use it: in a browser, or in a native app on iOS, Android, macOS, or Windows. On
each platform, components behave, respond, and perform like that platform's best
software on the OS version the person runs, and a product can offer experiences
that exist only on some platforms.

Every component has one shared core contract that keeps its meaning, words,
states, and accessibility the same everywhere, and a contract per platform that
adds the props that platform honors beyond the core. A developer sees the props
of the platform they build for, in TypeScript and in each native language, and a
prop from another platform is an error rather than a silent no-op. Documentation
and the CLI show the same split.

`@astryxdesign/core` serves the web. `@astryxdesign/native` serves the native
platforms and reads core in one direction only, so web users install nothing
native and native apps load nothing web. A team defines its visual identity once,
in one Astryx theme; native-only visual intent is written as durable outcomes
that keep their meaning as platforms change, and anything tied to one platform or
OS version is written only inside that platform's entry.

Astryx chooses how each native platform is built by measuring candidate
approaches against the platform's own toolkit on the same scenarios, and it
depends only on runtimes it can maintain.

## Non-goals

- The order in which platforms ship (OQ2) and each platform's supported OS
  versions (OQ4).
- Exact performance thresholds (OQ1). This record owns what is measured and how
  approaches are compared.
- The internals of any one platform's implementation, once it satisfies this
  contract.
- Product templates, navigation structures, and app shells built from Astryx
  components.
- Changing a web caller's types or behavior. Web removals that this contract
  implies follow `spec:AST-017` (FR14).
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — Astryx targets the web and named native platforms.** The web surface
  is browsers. The native surface is apps on the native platforms `ios` (iPhone
  and iPad), `android`, `macos`, and `windows`. Each native platform declares the
  OS versions it supports (OQ4). A native platform is supported only when it
  meets FR11 and FR12. Every component declares the platforms it supports.
- **FR2 — Each platform targets its own ceiling.** An implementation may use any
  capability its platform offers. No platform is limited to what another can
  express: native platforms are not limited to web markup and CSS, and the web
  is not limited to what native implementations can draw.
- **FR3 — A component has a core contract and a contract per platform.** The
  core contract is the component's name, the props every platform that offers
  the component honors with the same meaning and defaults, its states, its
  words, and its accessibility semantics (name, role, state, focus behavior, and
  announcements). It is the same on every platform that offers the component.
  - A platform honors a prop when the prop behaves the way core already defines
    for that platform's input type. `tooltip` stays in the core: core defines
    what a tooltip does where there is no hover (Tooltip `touchTrigger`), and a
    touch platform behaves that way.
  - A prop leaves the core only when a platform that offers the component cannot
    match core's defined behavior for its input type. Such a prop belongs to the
    contracts of the platforms that can (web, iOS, macOS, Android, Windows), and
    the same prop may appear in several platform contracts with one meaning
    (FR8). `rel` and `target` on a link belong to the web contract: an app
    platform opens every link through the system and has no relationship or
    browsing context to set.
  - Within one language, one API serves every platform that language's apps
    run on and adapts per device, as SwiftUI's `.help` shows a tooltip on
    macOS and becomes a hint on iOS. A prop is scoped to a single platform only
    when no honest behavior exists on that language's other platforms; such a
    prop states its reason, and never makes an app branch by platform (`#if`)
    for behavior that could adapt.
  - A platform never offers a prop it does not fully honor. A prop a platform
    accepts but ignores, or honors only in part, breaks
    `architecture:public-component-api/INV2`.
  - A platform contract never removes, renames, or changes the meaning of a core
    prop. Moving a released prop from the core to the web contract changes no
    web caller's types, because the web types are the core contract plus the web
    contract; native contracts stop offering it.
  - The web contract holds the web base props: styling inputs, DOM events, refs,
    element choice, and HTML attributes.
  - A component may exist on some platforms only; using it elsewhere fails at
    type check or build with a message that names the supported platforms, and
    never renders a silent substitute.
- **FR4 — The core contract is portable.** Every core prop has a form in each
  language a supported platform's apps are written in, including Swift and
  Kotlin: strings, numbers, booleans, closed string sets, open string sets,
  booleans combined with a closed string set, arrays, records of these, optional
  values, and callbacks whose arguments are portable.
  - An **open string set** is a set of built-in names that a theme or an
    application extends, as core's augmentable maps are. Its wire value is the
    name, the same as on the web. Each native platform's type for it is a
    string-backed value with a constant for each built-in name, and that
    platform's theme build adds a constant for each name the theme declares, as
    the web theme build writes the TypeScript augmentation. Any name decodes; a
    platform that receives a name it has no rule for draws the component's base
    look, as the web does for an augmented name with no built-in style.
  - A **boolean combined with a closed string set**, such as CheckboxInput
    `value: boolean | 'indeterminate'`, keeps `true`, `false`, and every named
    state as distinct values on every platform, and its wire value is the same
    as the web value.
  - A prop whose web type is wider than these kinds may name a portable closed
    set of the values every platform supports, each mapped to one web value,
    such as Button `width`: `content` (the default) or `fill`, where `fill` is
    the web's `'100%'`. The prop's other web values stay in the web contract.
  - Free-form content (`ReactNode`) and render functions are not portable. They
    belong to the web contract and to any platform contract whose implementation
    runs React; the core expresses content as a typed slot instead. A **text**
    slot is a string. An **icon** slot is a shared icon name (FR17), which each
    platform resolves the way FR17 says; on a native platform, in a development
    build an unknown name stops with a message that names the icon, and in a
    release build it draws nothing. A **content** slot holds named Astryx
    components. A platform contract may accept a wider form for the same slot,
    such as a React node on the web; the slot keeps one meaning, and the core
    form is what every native platform accepts.
- **FR5 — Platform props are platform-scoped types.** `@astryxdesign/core`
  exposes the core contracts and the web contracts; its default types are the web
  contracts, unchanged for web callers. `@astryxdesign/native` exposes the native
  platform contracts, selected by the consumer's type-resolution condition:
  `ios`, `android`, `macos`, or `windows`. Consumer configuration depends on these
  condition names, so they are public. Under a platform's condition, a
  component's props are its core contract plus that platform's contract, and a
  prop from another platform's contract is a type error. Swift and Kotlin
  bindings ship from `@astryxdesign/native`, generated from the same contract
  definition as the TypeScript types.
- **FR6 — Code for several native platforms can use the core alone.** Under the
  `shared` condition, `@astryxdesign/native` exposes only core contracts.
  Code that runs on more than one native platform type-checks against it, and a
  platform prop there is a type error; platform props live in that platform's
  files. Whether shared code must use this condition is OQ5. A file shared by web and
  native code imports only core contract types and non-visual logic; each
  platform's own files import that platform's components (DEC-9).
- **FR7 — Base props are coordinated across platforms.**
  - **Shared base props** are the same on every platform: `id`, a stable
    identifier, and `isHidden`, which removes the component from layout and the
    accessibility tree. Each platform maps them to its own mechanism, such as the
    `id` attribute on the web and the accessibility identifier on iOS.
  - **Platform base props** belong to one platform's contract. The web base
    props are the DOM attributes that `architecture:public-component-api`
    governs.
  - **Targeting:** each component declares the part its base props attach to,
    such as its root, trigger, control, or container, and the part is the same on
    every platform. A family record that already routes base props, such as
    `family:input-fields`, decides the part for its members.
  - **Reconciliation:** a core prop owns its concept. The platform base props
    for a concept a core prop owns are not part of that component's platform
    contract; a core `label` owns the accessible name, so the web
    `aria-label`/`aria-labelledby` and the iOS accessibility label are not
    separate inputs. A platform base prop whose name a core prop uses is removed
    from that platform's base, as the DOM `onChange` is where a component's
    `onChange` reports a value. This extends
    `architecture:public-component-api/INV5`: component-owned accessibility and
    behavior cannot be overwritten. How a removed hyphenated attribute that the
    type system cannot refuse is enforced is OQ6.
- **FR8 — Prop names do not collide across platforms.**
  - A platform prop never reuses a core prop name.
  - A core prop name is not a keyword in Swift or Kotlin, and is not a name a
    platform toolkit already uses with a different meaning, such as `style` or
    `testID` in React Native.
  - Astryx may reclaim a web base name for a component prop when the component
    owns that concept. Each reclaimed name is declared, and the platform's own
    meaning is removed from that component's base props (FR7). `onChange`,
    `title`, `color`, and `content` are reclaimed today.
  - The same name may appear in two platform contracts only for the same concept,
    such as a `menuStyle` with each platform's own values. It never appears in a
    type that merges platforms, and documentation shows each platform's values.
  - A web contract prop that fails these rules, such as `as` (a Swift and Kotlin
    keyword) or `style`, stays in the web contract and never enters the core.
- **FR9 — Documentation and the CLI are platform-aware.** Every prop in a
  component's documentation is marked core or names its platform, and every
  example names the platform it targets. Native platform contracts are
  documented by `@astryxdesign/native`. `astryx component <Name>` shows the core
  contract and, with a platform selection, that platform's contract. Output for
  one platform never lists another platform's props as available. Theme
  documentation shows native theme configuration per platform.
- **FR10 — Native theme configuration builds on the defined theme.** One
  `defineTheme` definition serves the web and every native platform, and it stays
  the single authority for tokens. Tokens and theme-local tokens are the
  shared part and mean the same thing everywhere
  (`architecture:theme-compilation/INV10`); web-only parts follow FR18. `@astryxdesign/native` exports
  `defineNativeTheme(theme, config)`, which takes a `DefinedTheme` unchanged and
  adds native-only visual intent; it never sets or overrides tokens:
  - **Durable intent.** Members name an outcome a person sees, never a platform
    feature name or an OS version. The members are `material`, typed
    `'opaque' | 'translucent'`; `corners`, typed `'smooth' | 'stepped'`, where
    smooth draws the platform's own rounded corner at the radius token and
    stepped draws square steps the size of `border-width`, as many as fit in the
    radius, with borders following the same steps; `imageScaling`, typed
    `'smooth' | 'pixelated'`, where pixelated scales raster images by nearest
    neighbour; and `textGrid`, a positive integer, the number of grid cells per
    em the typeface is drawn on, to which text sizes, including the platform's
    text-size growth, snap so one grid cell covers whole device pixels, never
    below the person's text-size setting. An absent member keeps the platform's
    default look. Every native platform reads durable intent and realizes it
    with the closest capability of the running OS version, such as the system
    glass material on iOS versions that have one, or an earlier system blur. A
    platform with no such capability renders as if the member were absent.
  - **Platform entries.** `platforms.<platform>` uses the platform names of FR1
    and FR5 and holds an ordered list of entries. An entry may name an OS version
    range, `minVersion` and an optional `maxVersion`; an entry without a range
    applies to every supported version. An entry holds members from that
    platform's own vocabulary, such as `material: 'liquidGlass'` for `ios`, and
    `components`: overrides for that platform's theme targets, including targets
    that exist only in that platform's contract, drawn from that platform's
    published list of theme targets and members, so an unknown target or member
    is a type error. An entry applies only on its
    platform and inside its range. There, its members replace durable members of
    the same name, and a later matching entry replaces an earlier one.
  - A platform feature name is valid only inside its platform's entry, and a
    feature that exists only on some OS versions is valid only in an entry whose
    range lies within them.
  - A native theme may `extends` another: durable members merge member by
    member, and a child's entry list for a platform replaces the base's list for
    that platform. Every value is plain serializable data, and a member outside
    the published vocabulary is a type error.
- **FR11 — Native platforms are native-first on every supported OS version.** A
  component uses the platform's own control or convention when one satisfies its
  contract: navigation, sheets, menus, pickers, switches, text input, scrolling,
  focus, keyboard shortcuts, haptics, and system materials. It draws a custom
  control only where the platform has none. On each supported OS version it uses
  that version's controls and materials. A capability newer than the running OS
  degrades to the closest earlier platform equivalent or to durable intent, never
  to a broken or blank state. Touch targets meet the platform minimum, and text
  follows the platform's text-size setting. When a component chooses between
  presentations by screen size, compact is `spec:AST-012` FR9 in points or
  density-independent pixels, not the platform's size classes; the platform's
  own control still presents the chosen surface. A native platform is supported only
  when it meets the FR12 criteria on its oldest and newest supported OS versions.
- **FR12 — Approaches are compared on one scorecard.** Every candidate way of
  building a native platform is measured the same way. Candidates include
  platform views on generated contracts, React Native components, component
  logic in TypeScript running in a JavaScript engine that drives platform views,
  and Astryx's web React components run through a native renderer:
  - **Scenarios:** one shared set of scripted user flows over representative
    components and templates, each step defined once by the person's gesture
    and its expected state, and replayed unchanged on every candidate and on
    the reference.
  - **Reference:** the same scenarios built directly with the platform's own
    toolkit, such as SwiftUI or UIKit, Jetpack Compose, AppKit, or WinUI. The
    reference sets the ceiling a candidate is scored against.
  - **Devices:** real hardware running release builds, on the oldest and newest
    supported OS version of each platform, including a lower-end device.
  - **Captures:** every scenario step is captured as a screenshot on the
    device, every behavior, such as a sheet opening and dismissing, a
    navigation transition, a gesture, scrolling, press feedback, and the
    keyboard appearing, as a short video, and every scenario as a screen
    recording. Captures are taken for each candidate, the reference, and the web
    rendering of the same scenario, in light and dark and at the largest text
    size. Visual and motion scores are judged from these captures, never from
    source code or style values.
  - **Experience:** conformance to platform conventions and to the core
    contract (FR3), judged per scenario step, and behavior and motion, judged
    per behavior video for timing, gesture response, and interruptibility
    against the reference.
  - **Brand preservation:** how recognizably the theme's identity, its color,
    typography, shape, spacing, and icons, carries to the platform while the
    screen stays native-first, judged against the web rendering of the same
    theme, plus pixel checks on the captures against the theme's resolved
    values.
  - **Performance:** time to first content, frame pacing and dropped frames
    during each scenario, input-to-response latency, memory, and the size the
    approach adds to an app.
  - **Accessibility:** parity with the core contract for names, roles, states,
    focus order, and announcements under each platform's screen reader.
  - **Maintenance:** the work one Astryx release and one new OS version require
    on that platform, whether core contract changes reach it automatically, and
    the time from an OS release to shipping one of its new features.
  - **Developer speed:** time from an edit to seeing it on a device, and the
    share of an app's code reused across platforms.
  - **Dependencies:** every required runtime dependency, classified under FR13.

  A candidate that fails FR13 or falls below the OQ1 thresholds is not
  supported, whatever its other scores.

- **FR13 — Required dependencies are platform, first-party, or React Native's
  own platforms.** A native platform's required runtime dependencies are limited
  to the platform's own SDKs, open-source projects maintained by the organization
  that maintains Astryx, such as React, React Native, Hermes, and StyleX, and,
  for macOS and Windows, the out-of-tree platforms React Native names as its own
  for them (`react-native-macos` and `react-native-windows`). Any other
  third-party library or fork may be an optional integration, an example, or a
  reference. It is never required to use Astryx on any platform. The FR12
  dependency measure records each required runtime's maintainer and how far its
  releases trail React Native's.
- **FR14 — Core is unchanged by native support.** `@astryxdesign/core` never
  imports or depends on `@astryxdesign/native`. For every theme, generated CSS,
  mounted rules, and rendered web markup are byte-identical whether or not the
  native package is installed. The web contract keeps every prop and base prop it
  has today. A removal that FR7 or FR8 implies for a web caller is a breaking
  change and ships only in a planned minor under `spec:AST-017`, and so does
  making an existing web prop an icon slot where the web renders a string as
  text today.
- **FR15 — Native support ships on the canary channel until a platform is
  supported.** `@astryxdesign/native` is a private, canary-only package
  (`spec:AST-033/FR4`): it publishes only to the canary channel and never as a
  stable release. It joins the stable release group in a planned minor once its
  first platform is supported under FR11 and FR12. Until then, its platform
  contracts and native theme configuration may change in any canary.
- **FR16 — Native reads core in one direction, through a portable entry.**
  `@astryxdesign/native` reads `@astryxdesign/core` only through a portable entry
  that carries the core contracts as types and data, the `DefinedTheme` type, and
  resolved token values. The portable entry has no DOM types, requires neither
  `react-dom` nor StyleX, and includes no web theme compiler or web component
  implementation, so a native app neither installs nor bundles web-only code.
  Native platform contracts are generated from the core contract definitions at
  build time, so a core contract change reaches every native platform on its next
  build; generated Swift and Kotlin bindings carry nothing from core at run time.
  A package-boundary check enforces both directions: core never imports native,
  and native never imports core outside the portable entry. Until the portable
  entry ships, a native build script may read core at build time through
  `@astryxdesign/core/theme` and `@astryxdesign/core/theme/tokens`, and read
  core's component documentation, its built-in icon names, and its locale
  catalogs as data, to
  generate native code and to check native coverage in native tests. The
  boundary check lists each such read by name and refuses any other, and no
  native runtime code or generated binding imports core. The portable entry
  is an entry of `@astryxdesign/core` (DEC-8). It makes `react-dom` and StyleX
  optional peers of core and keeps resolved token values apart from the web theme
  compiler.

- **FR17 — Icons share names and default to platform symbols.** Every
  platform shares Astryx's semantic icon names, the built-in names plus
  namespaced `<library>:<name>` names, carried by the portable entry. Each native
  platform maps every built-in name to a default image from its own system set,
  such as SF Symbols on Apple platforms and Material icons on Android, and a
  native platform is supported only when its map covers every built-in name. An
  icon the app or theme defines replaces the platform default. Native theme
  configuration names platform icons as data inside a platform entry, such as
  `icons: {close: {systemName: 'xmark.circle'}}`, or an image the app ships,
  such as `{assetName: 'pixel.close'}`, so an icon that exists only on
  some OS versions can be scoped like any other platform term; other images an app
  supplies are registered in code. A native platform has no default for a name it
  does not map and never substitutes a web icon. An asset icon the app does not
  ship stops a development build with a message that names the asset, and draws
  nothing in a release build, as an unknown icon name does. Icon accessibility follows the
  core contract: an icon is decorative unless it carries a label.

- **FR18 — The theme definition has a portable part and a web part.** The
  portable entry exports `PortableTheme`: a theme's name, tokens, theme-local
  tokens, and the compact definition of `spec:AST-012` FR9 (the effective `md`
  width point and the 500 height edge), each resolvable without CSS to a concrete value per color mode, such as
  a color, a length in density-independent units, a number, or a font name. The
  web part holds what only the web compiles or renders: component overrides keyed
  by web theme targets, icon and indicator registries of React elements,
  media-surface overrides, adaptations, and build metadata. `DefinedTheme` is
  `PortableTheme` plus the web part, so every web caller and every maintained
  theme keeps its types and behavior. `defineNativeTheme` accepts a
  `PortableTheme`, so a `DefinedTheme` passes unchanged. When it receives web
  parts with content, it reports each one in development as having no native
  meaning rather than dropping it silently; native component theming comes from
  platform entries (FR10), and native icons follow FR17.
- **FR19 — A logic core drives native views through one wire.** For the
  candidate in which component logic runs in TypeScript inside a native app
  (FR12), `@astryxdesign/native` defines one wire, generated from the same
  contracts as every binding (FR5). The wire is a canary surface of that
  candidate (FR15).
  - **Nodes.** A screen is a tree of nodes. A node names its component, has a
    `key` unique among its siblings, may carry shared base props (FR7), carries
    its data props as that platform's contract defines them, and lists in
    `events` the callbacks the logic handles. A content slot (FR4) carries
    child nodes. A native view receives only the callbacks listed in `events`.
  - **Actions.** When a view calls a listed callback, the host sends one action:
    the node's `key`, its component, the callback's name, and the callback's
    portable arguments in order.
  - **Compatibility.** A host draws every node it can read. A node it cannot
    read, because the component is unknown to it, a value lies outside its
    closed set, or a prop it requires is missing, renders as unsupported in its
    place, and its siblings still render. Props a host does not know are
    ignored.
  - **Bridge.** The host loads the logic bundle and calls its global
    `astryxStart(host)`, passing two calls in: `connected(version)` and
    `changed(tree)`. It gets back a bridge it reads the current tree from and
    dispatches actions to. Trees and actions cross as JSON, and the bridge has
    a version.
  - **Failure.** A missing entry, a JavaScript error, a bridge version that
    differs from the host's, or a tree the host cannot read at all stops the
    host: it reports the failure, draws no tree, ignores any later tree, and
    sends no action. The logic core refuses input that is not an action.
  - **Engine.** The logic core uses ECMAScript built-ins only, so it runs in any
    engine FR13 allows.

### Platform support

- Supported feature/engine floor: the web floor is unchanged. Each native
  platform declares its supported OS versions (OQ4). Platform-scoped types need a
  TypeScript version that supports custom resolution conditions.
- Unsupported behavior: on an OS version outside every platform entry, durable
  intent applies; a durable member a platform cannot realize renders as absent;
  a platform-specific prop or component used for another platform fails at type
  check or build (FR3, FR5).
- Browser evidence: none for FR14, which is proven at compiler and render
  output. Native claims are proven on real devices under FR12.

## Current-state impact

- `architecture:public-component-api` gains the shared base props, the web base
  as a platform contract, base-prop targeting, and core-owned concepts (FR7)
  when a native platform ships.
- `architecture:cli-surface` gains the platform selection for component output
  (FR9).
- `architecture:theme-compilation` gains the native theme boundary when a native
  platform ships (INV9, INV10).
- `architecture:theme-authoring-contract` gains `PortableTheme` as the portable
  part of `DefinedTheme` when the portable entry ships. `DefineThemeInput` is
  unchanged for web callers; `DefinedTheme` gains the compact definition
  (`spec:AST-012` FR9) additively, derived from the theme's effective `md` point,
  and is otherwise unchanged.
- The `theme` and `cli` consumer docs and every component's documentation gain
  platform marking when the first native contract ships.
- `@astryxdesign/native` ships on the canary channel with the FR19 wire: the
  generated node and action types, the logic core and bridge, and a Swift logic
  host. Its contract model still types FR4 open string sets as closed sets, so
  the generated node types for each platform and the Swift binding both reject
  a theme-added name, such as a Button `variant`; the TypeScript types refuse
  it, and a Swift host renders the node as unsupported instead of drawing the
  component's base look.
- `@astryxdesign/core` has no portable entry yet. Core peer-depends on `react-dom` and StyleX, and its theme entry includes
  the web theme compiler.
- Built-in icon names are defined beside the web icon registry, which maps them to
  React elements; the portable entry carries the names only when it ships.
- No native platform is supported yet. Every shipped component supports the web
  only, and its props form its web contract.

## Verification

| Contract | Verification                                                                                                                                                  | Representative states                                                                                                                                                                                                                                                                                                                                                          | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR3 | Component documentation metadata check, plus type and build tests importing a platform-specific component, plus a per-platform prop check over every contract | a shared component; a web-only component; a component on some native platforms; an unsupported platform; a prop every offering platform honors; a prop only some platforms honor; a released prop moved from the core to the web contract; a prop that adapts across one language’s platforms; a single-platform prop                                                          | A component declares no platforms, claims an unsupported native platform, or an unsupported import type-checks, builds, or renders a substitute, a platform type accepts a prop that platform cannot honor, a core prop is missing on a platform that offers the component, or moving a prop to the web contract changes a web caller’s types, or a single-platform prop has no stated reason or makes an app branch by platform for behavior that could adapt                                                                                                                     |
| FR4      | Contract generation to TypeScript, Swift, and Kotlin, compiled in each language                                                                               | every core prop kind; a boolean combined with a closed string set; an open string set with a built-in name, a theme-declared name, and a name the platform has no rule for; a projected prop at each portable value and at a web-only value; a text, icon, and content slot, and a web call site passing a wider form; a free-form content or render-function prop in the core | A core prop has no Swift or Kotlin form, a non-portable prop enters the core, a named state collapses into `true` or `false`, a theme-declared name is rejected by a platform type, an unknown open-set name fails instead of drawing the base look, a wire value differs from the web value, a projected value maps to a different web value or a web-only value reaches a native type, or a slot accepts a wider form on a platform that cannot render it                                                                                                                        |
| FR5, FR6 | Type checks of fixture apps against each package and condition                                                                                                | core default (web); each native condition; `shared`; a platform prop in another platform's file and in a shared file                                                                                                                                                                                                                                                           | A platform prop type-checks under another platform's condition or under `shared`, a core prop is missing under any condition, or web types change                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| FR7      | Generated base-prop surfaces per platform, plus runtime targeting tests                                                                                       | shared base props; a core-owned concept; a core prop that reuses a base name; each targeted part                                                                                                                                                                                                                                                                               | A shared base prop differs by platform, an owned concept's base prop overrides the core prop, or base props reach a different part on another platform                                                                                                                                                                                                                                                                                                                                                                                                                             |
| FR8      | Contract name check over every component                                                                                                                      | core prop vs platform prop; Swift and Kotlin keywords; platform toolkit names; reclaimed names; one name in two platform contracts                                                                                                                                                                                                                                             | A collision passes, a reclaimed name is undeclared, or a same-named platform prop appears in a merged type                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR9      | Documentation and CLI output checks                                                                                                                           | core only; each platform selection; native package absent                                                                                                                                                                                                                                                                                                                      | Output for one platform lists another platform's prop, or a prop is unmarked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR10     | `defineNativeTheme` unit and type tests, plus a resolution test per platform, plus captures that look at a drawn corner and a drawn image                     | durable `material` only; entry with and without a range; overlapping entries; platform `components`; native theme extension; a token in native configuration; platform term outside its entry or range; each of `corners`, `imageScaling`, and `textGrid` present and absent; a platform entry with an unknown component target or member                                      | A token can be set, a platform term type-checks outside its entry or range, an entry applies outside its platform or range, overlap order is ignored, or extension drops members, a durable member changes anything when absent, `textGrid` shrinks text below the text-size setting, or an unknown target or member type-checks, or `textGrid` leaves a grid cell on a fraction of a device pixel, `corners: 'stepped'` draws anything but square `border-width` steps that fill the radius with the border following them, or `imageScaling: 'pixelated'` smooths a raster image |
| FR11     | FR12 experience scores per scenario step, oldest and newest supported OS                                                                                      | navigation, sheet, menu, picker, switch, text entry, scrolling, keyboard shortcut, large text; a capability newer than the running OS                                                                                                                                                                                                                                          | A step draws a custom control where the platform provides one, misses the touch-target minimum, ignores the text-size setting, or breaks on the oldest supported OS                                                                                                                                                                                                                                                                                                                                                                                                                |
| FR12     | Scenario replay on candidates and reference, on real release builds and devices                                                                               | each scenario on each candidate and the toolkit reference; oldest and newest supported OS; a lower-end device per platform                                                                                                                                                                                                                                                     | A candidate is scored without the reference, on a debug build, on emulation only, on one OS version, or on a different scenario set, or a visual score is given without device captures                                                                                                                                                                                                                                                                                                                                                                                            |
| FR13     | Dependency manifest audit of each native platform package                                                                                                     | platform SDK; first-party project; a React Native out-of-tree desktop platform; third-party optional integration; third-party fork                                                                                                                                                                                                                                             | A third-party library or fork is required to install, build, or render on the platform                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| FR14     | Compiler and render output comparison, core dependency graph check, and a web type surface diff                                                               | each maintained theme with and without the native package installed; runtime-mounted and built CSS; components; web types before and after; an existing web prop that renders a string as text becomes an icon slot                                                                                                                                                            | Any byte of CSS, mounted rules, or rendered web markup differs, core depends on native, or a web prop disappears outside a planned minor, or an existing web prop that renders a string as text becomes an icon slot in a patch rather than a planned minor                                                                                                                                                                                                                                                                                                                        |
| FR15     | Package metadata and release-channel checks                                                                                                                   | native package manifest; a stable release; a canary release                                                                                                                                                                                                                                                                                                                    | The native package is publishable as a stable release before a platform is supported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR16     | Package-boundary check, plus a native fixture app installed and bundled without `react-dom` or StyleX                                                         | an import of the portable entry; an import of a core component or the web theme entry from native; a listed build-time read from a native build script; an unlisted one; a core import of native; a core contract change                                                                                                                                                       | Native resolves a DOM type, `react-dom`, StyleX, or a web module; either direction of the boundary is crossed, an unlisted build-time read passes; or a core contract change does not reach native contracts on the next build                                                                                                                                                                                                                                                                                                                                                     |
| FR17     | Icon map coverage check per native platform, plus override resolution tests                                                                                   | every built-in name; a namespaced name; a theme platform icon with and without a version range; an app-registered icon; an icon slot given an unknown name in a development and a release build; an asset icon the app ships and one it does not; a missing asset icon in a development and a release build                                                                    | A built-in name has no platform default, a theme or app icon fails to replace the default, a scoped icon applies outside its range, a web icon is substituted, or an unknown name draws something in a release build or does not stop a development build with its name, or a missing asset icon draws a substitute, or a development build does not stop with a missing asset’s name                                                                                                                                                                                              |
| FR18     | Type tests over `PortableTheme` and `DefinedTheme`, token resolution tests per color mode, and `defineNativeTheme` reporting tests                            | each maintained theme; a theme with component overrides, icons, indicators, media surfaces, and adaptations; light and dark; a length, a color, and a font token; a theme that overrides `md`, whose compact definition follows the override                                                                                                                                   | A `DefinedTheme` member a web caller uses is removed or changes, a portable token needs CSS to resolve, `PortableTheme` references a React or DOM type, a web part with content is dropped without a report, or the compact definition does not follow a theme's effective `md`                                                                                                                                                                                                                                                                                                    |
| FR19     | Wire type tests per platform condition, Swift decoding tests, host tests in a JavaScript engine, and a logic core run with no host globals                    | a tree with a content slot; a listed and an unlisted callback; an unknown component; an unknown closed-set value; a missing required prop; a node carrying a prop the host does not know; input that is not an action; a bundle with no entry; a JavaScript error; a bridge version mismatch; a tree the host cannot read at all; a tree sent after a failure                  | A view gets an unlisted callback, an action carries a different key or arguments, one unreadable node blanks its siblings, a prop the host does not know makes its node unsupported, the logic core accepts input that is not an action, or a failed host draws a tree or sends an action                                                                                                                                                                                                                                                                                          |

## Decision log

### DEC-1 — Every platform targets its own ceiling; platforms share a core contract and the theme

**Reference:** `spec:AST-082/DEC-1`
**Decider:** cixzhang, 2026-10-20

A person on any platform should get a native-first experience, so no platform
is held to what another can express. What every platform shares is the core
contract and the theme, which keeps behavior, words, accessibility, and identity
consistent while each platform uses its own capabilities fully.

Rejected: requiring every platform to run the web implementation, because it
caps native experiences at what web markup and CSS can express.

### DEC-2 — Native-only visuals are theme configuration, not component props

**Reference:** `spec:AST-082/DEC-2`
**Decider:** cixzhang, 2026-10-20

An app's look already lives in its theme, so native-only visual intent builds on
the defined theme in a native theme the web never loads. It can change while
native platforms learn what they need, without risk to any web user. Platform
props (DEC-6) carry behavior and presentation choices a platform offers, not
visuals.

Rejected: visual props for one platform on components, because they move a
theme decision into every call site.

### DEC-3 — How a native platform is built is decided by measurement

**Reference:** `spec:AST-082/DEC-3`
**Decider:** cixzhang, 2026-10-20

Generated native components and web components run through a native renderer
both remain candidates. The FR12 scorecard, measured against the platform's own
toolkit, decides which approach a platform uses, and a platform may change
approach when a candidate scores higher.

### DEC-4 — Astryx requires only platform, first-party, and React Native's own platform runtimes

**Reference:** `spec:AST-082/DEC-4`
**Decider:** cixzhang, 2026-10-21

A platform whose required runtime Astryx cannot maintain can break or stall
outside the project's control, so required dependencies are limited to platform
SDKs and first-party projects (FR13). React Native's out-of-tree desktop
platforms are allowed so that React Native and pure native can be compared on
macOS and Windows as on iOS and Android; the scorecard measures their
maintenance risk instead of excluding them.

Rejected: requiring any other third-party runtime or fork, because Astryx could
neither fix it nor schedule around it.

### DEC-5 — Native theme intent is durable; platform and version features are scoped

**Reference:** `spec:AST-082/DEC-5`
**Decider:** cixzhang, 2026-10-20

Platform features are introduced, renamed, and retired across OS releases, so
the shared native vocabulary names outcomes a person sees, and each platform
maps them to what its running OS offers. A feature that exists only on one
platform or OS version stays expressible inside that platform's entry and
range, so it never reaches a platform or version where it means nothing.

Rejected: platform feature names in shared native intent, because they lose
their meaning on other platforms and OS versions.

### DEC-6 — Components have platform contracts on a shared core, exposed as platform-scoped types

**Reference:** `spec:AST-082/DEC-6`
**Decider:** cixzhang, 2026-10-20

One strict contract for every platform reduces each component to what every
platform can honor, while separate per-platform components lose the shared
meaning that people, agents, and documentation rely on. A shared core plus
platform contracts keeps one meaning and lets each platform add its own props,
and platform-scoped types make a prop from another platform a compile error in
TypeScript, Swift, and Kotlin rather than a silent no-op. The TypeScript compiler
enforces this for every named prop; hyphenated JSX attributes are the exception
(OQ6).

Rejected: one type that merges every platform's props, because it lets one
platform's prop reach another platform's code and merges same-named props with
different values.

### DEC-7 — Native lives in its own package, `@astryxdesign/native`

**Reference:** `spec:AST-082/DEC-7`
**Decider:** cixzhang, 2026-10-21

Web users install nothing native, native apps load nothing web, and a core
release never waits on a native platform. Core keeps the core and web contracts;
`@astryxdesign/native` holds the native platform contracts, the Swift and Kotlin
bindings, native theme configuration, and native implementations, and reads core
only through the portable entry, apart from the build-time reads FR16 lists
until that entry ships.

Rejected: native types and implementations inside `@astryxdesign/core`, because
every web consumer would carry them and core's API would grow with each platform.

### DEC-8 — The portable entry is an entry of `@astryxdesign/core`

**Reference:** `spec:AST-082/DEC-8`
**Decider:** cixzhang, 2026-10-21

The core contracts, the theme definition, and token resolution already live in
core, so a portable entry inside core moves no existing code while native is
canary-only. Native depends on core's exact version, as other canary-only
packages do. This decision is revisited before `@astryxdesign/native` joins the
stable release group (FR15).

Rejected: a separate shared package now, because it moves code and adds a
package to the release group before any native platform has shipped.

### DEC-9 — Web and native share contracts and logic, not components

**Reference:** `spec:AST-082/DEC-9`
**Decider:** cixzhang, 2026-10-21

Code shared between a web app and a native app imports core contract types and
non-visual logic only, and each platform's files import that platform's
components. This keeps the one-way boundary (FR16) intact, and most native apps
share logic rather than screens with their web app.

Rejected: a shared component entry that resolves to core on the web and to
native elsewhere, because it hides which platform's contract a call site gets.

### DEC-10 — Native icons default to platform symbols

**Reference:** `spec:AST-082/DEC-10`
**Decider:** cixzhang, 2026-10-21

An icon that sits beside system controls should look like the platform's own,
so where neither the app nor the theme defines an icon, each native platform
draws its system symbol for the shared name. Brand consistency remains a theme
or app choice.

Rejected: Astryx's web icons on every platform by default, because they look
foreign next to system controls.

### DEC-11 — The theme definition splits into a portable part and a web part

**Reference:** `spec:AST-082/DEC-11`
**Decider:** cixzhang, 2026-10-21

Native platforms need a theme's identity, not its CSS. Splitting `DefinedTheme`
into `PortableTheme` and a web part gives native the shared identity through the
portable entry, keeps React elements and CSS out of native apps, and removes
nothing for web callers, because `DefinedTheme` is still the whole; the portable
compact definition it gains is additive.

Rejected: native reading the whole `DefinedTheme`, because it carries React
elements, CSS maps, and DOM-typed imports native cannot use.

### DEC-12 — Open sets extend per theme, and a wider web type may project to native

**Reference:** `spec:AST-082/DEC-12`
**Decider:** cixzhang, 2026-10-23

A theme's own variants reach every platform the way they reach the web: the
platform theme build adds the theme's names to a string-backed type, so code
names them like built-ins, and any name decodes, so a newer theme never breaks
an older app. Where a web prop accepts values no native platform can honor,
the core names the few that every platform supports instead of leaving the
prop web-only.

Rejected: an enum of built-in names with a case for any other string, because
theme names would stay plain strings and the theme build would generate
nothing.

### DEC-13 — A boolean with named states has one portable form

**Reference:** `spec:AST-082/DEC-13`
**Decider:** cixzhang, 2026-10-23

Props such as a checkbox's mixed state or a tooltip's `'auto'` mean the same on
every platform, so one rule gives each platform `true`, `false`, and the named
states as distinct values, and the wire carries the web's value unchanged.
Web callers see no change.

Rejected: a native name per component for the same values, because one value
would have two names. Rejected: changing core to a closed string set, because
it breaks web callers outside a planned minor release.

### DEC-14 — The core holds only what every platform honors

**Reference:** `spec:AST-082/DEC-14`
**Decider:** cixzhang, 2026-10-24

A prop kept everywhere for consistency, but ignored where a platform cannot
honor it, tells callers it works when it does not. So the core holds the props
every platform that offers a component honors as core defines them, and a prop
some platforms cannot honor lives in the contracts of those that can. One module
can still serve several platforms, and a prop can work on only some of them.
People build once in a language and run on every device it reaches, so within a
language the API adapts per device and a single-platform prop is the rare
exception.

Rejected: keeping every web prop in the core with a per-platform opt-out list,
because each platform's real surface would be the core minus a list nobody
reads.

### DEC-15 — A logic-core tree degrades per node, and a failed host stays failed

**Reference:** `spec:AST-082/DEC-15`
**Decider:** cixzhang, 2026-10-23

A newer logic core can reach an older app, so a host draws what it can read and
marks only the node it cannot read as unsupported, rather than failing the whole
screen. A host that cannot trust the bridge at all stops instead, and stays
stopped, so a person never sees controls that do nothing.

### DEC-16 — Corners, image scaling, and the text grid are durable intent

**Reference:** `spec:AST-082/DEC-16`
**Decider:** cixzhang, 2026-10-23

A brand whose look is stepped, pixelated, or grid-aligned names an outcome a
person sees, and it means the same on every native platform, so the brand writes
it once as durable intent rather than repeating it in each platform's entry.

Rejected: iOS platform-entry terms only, because every other native platform
would need the same words again.

## Open questions

- **OQ1 — What thresholds make a candidate supported?** (`human-design`)
  Options: parity with the toolkit reference within a fixed tolerance, or fixed
  absolute budgets per platform. Recommendation: relative to the reference on
  the same device and OS version — time to first content and memory within 10%,
  no more dropped frames than the reference across a scenario, and full
  accessibility parity — because absolute budgets drift as devices change.
- **OQ2 — Which native platforms ship first?** (`human-design`) Options: `ios`
  and `android` first, `macos` first, or all together. Recommendation: `ios` and
  `android`, then `macos`, then `windows`.
- **OQ4 — Which OS versions does each native platform support?**
  (`human-design`) Options: the latest two major versions of each OS, or a floor
  tied to a minimum share of active devices. Recommendation: the latest two
  major versions, reviewed at each major OS release, because it bounds testing
  and keeps scoped entries few.
- **OQ5 — Must code for several native platforms use the core-only condition?**
  (`human-api`) Options: required, so a platform prop in shared code fails in one
  check; or optional, with shared code type-checked once per platform it runs on.
  Recommendation: required by default, because a per-platform check passes a
  leaked prop on every platform where the prop exists and catches it only on the
  others.
- **OQ6 — How are removed hyphenated base props enforced?** (`human-api`)
  TypeScript does not check hyphenated JSX attribute names, so a removed
  `aria-*` or `data-*` input still type-checks. Options: a lint rule, a
  development warning with the input not applied, or both. Recommendation: both,
  with the runtime change shipped as a breaking change under FR14.
