---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-087
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-22
phase: accepted
owners: [cixzhang, imdreamrunner]
affects_architecture:
  [
    architecture:component-theming-surface,
    architecture:icon-resolution-and-component-slots,
    architecture:theme-application,
    architecture:theme-authoring-contract,
    architecture:theme-compilation,
  ]
affects_families: []
affects_contributing: []
affects_consumer_docs: [theme, Icon]
---

# Icon variants, theme sizes, and component icon slots system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A theme decides how icons look:

- `Icon` takes an optional `variant`. A theme lists the variant names it
  supports once, and a theme icon entry can be a pure function of the final size
  and that variant, so the theme maps both to its icon library's own artwork or
  props.
- A theme sets the dimension of each Icon size through the Icon stylesheet
  target.
- A component exposes a themeable icon as a `componentIcons` slot, and a slot
  entry can resolve from the component's typed state, so a theme decides what a
  pressed, selected, or disabled icon looks like.

## Non-goals

- Appearance or weight axes, per-icon capability declarations, adaptive variant
  trees, or variant names defined by Astryx.
- New Icon size names.
- Additional component icon maps, an icon-role concept, nested per-state maps,
  or compound state keys.
- Variants for icon components passed directly to `Icon`. They render as given
  and never receive `variant`; Icon's target, size, and color still apply to
  them.
- Replacing stateful control marks that a component draws through an indicator.
  Those stay with `defineTheme({indicators})` (FR15).
- How a component-owned icon box follows the theme dimension, and which
  component glyphs render through `Icon`.
- DOM or SVG measurement, SVG synthesis, or mixing artwork from two sources for
  one request.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

### Variant and theme entries

- **FR1 — A theme icon entry is a node or a function of the request.**
  `DefineThemeInput.icons` and process-wide registration accept, for a semantic
  or namespaced key, a React node or a function receiving `{size, variant}`, where
  `size` is the final Icon size and `variant` is a variant the active theme lists,
  or `undefined`. Conceptually:

  ```ts
  type IconRequest<Variant extends string = IconVariant> = Readonly<{
    size: 'xsm' | 'sm' | 'md' | 'lg';
    variant?: Variant;
  }>;

  type IconEntry<Variant extends string = IconVariant> =
    React.ReactNode | ((request: IconRequest<Variant>) => React.ReactNode);
  ```

  A theme maps size and variant to its library's own props or artwork:

  ```tsx
  defineTheme({
    name: 'brand',
    iconVariants: ['outline', 'filled'],
    icons: {
      info: ({size, variant}) => (
        <InfoIcon
          weight={
            variant === 'filled' ? 'fill' : size === 'sm' ? 'bold' : 'regular'
          }
        />
      ),
    },
  });
  ```

- **FR2 — A theme lists its variant names once.** `DefineThemeInput.iconVariants`
  is a list of variant names that applies to the whole theme, never to one icon.
  A child theme that sets `iconVariants` replaces the inherited list; one that
  omits it inherits the list.
- **FR3 — The list types the theme and the request.** Inside `defineTheme`, entry
  functions receive `variant`, and static slot requests and slot resolvers
  return it, typed as the theme's listed names. `Icon`'s `variant` prop uses
  `IconVariant`, the names in the public, augmentable `IconVariantMap`. The
  theme build writes an augmentation of that map from the theme it builds, the
  same way it augments custom component values, and an application may augment
  the map itself. Astryx never derives a variant type from several themes'
  lists; when an application loads several built themes, TypeScript merges their
  augmentations, and FR4 renders the normal icon wherever the active theme does
  not list a requested name.
- **FR4 — An unlisted variant renders the normal icon.** `Icon` passes a
  requested `variant` to the selected entry only when the active theme lists it
  and, for an entry a theme supplied, the theme that defined the entry lists it
  too; an entry a child theme inherits keeps the list of the theme that defined
  it. Otherwise the entry receives `undefined` and renders its normal artwork:
  an omitted variant, an unlisted variant, and a request with no active theme
  list all behave this way. A process-wide registration receives the variants
  the active theme lists. A node entry renders the same node for every variant.
- **FR5 — Variant applies to registry icons.** An icon component passed directly
  to `Icon` renders as given and does not receive `variant`; `Icon` does not
  forward `variant` to it or to the DOM. `variant` selects artwork only: the
  `icon` theming target does not reflect it, so it has no styling selector.
- **FR6 — Sources resolve before the request.** A theme entry wins over a
  process-wide registration, which wins over the built-in default; a nullish
  static entry falls through to the next source. The selected function's result is
  final for that resolution: a nullish result renders no glyph and never falls
  through to another source.
- **FR7 — Entries and resolvers are pure and synchronous.** They compute their
  result from their input only, without hooks, DOM or SVG measurement, browser
  globals, network access, mutable module state, or side effects.
- **FR8 — Build tooling can enumerate a theme's icons.** Every request a theme
  entry can receive is its key with one of the four sizes and either no variant
  or one variant the entry can receive under FR4. Build tooling that generates or subsets icon artwork may call
  each entry for exactly that set; the result matches what the entry returns at
  runtime.

### Sizes

- **FR9 — Entries receive the resolved size.** `Icon` resolves its size by
  `component:Icon` ORD1 (`xsm`, `sm`, `md`, `lg`) and passes it to the entry,
  which selects artwork for that size.
- **FR10 — A theme sets each size's dimension in the stylesheet.** The Icon theming
  target guarantees `width` and `height` on its size selectors, so
  `components.icon['size:sm']` sets the `sm` dimension. Without theme styles,
  sizes are 12, 16, 20, and 24px at a 16px root and scale with the root font size.

### Component icon slots

- **FR11 — Component icons are `componentIcons` slots.** A themeable icon a
  component owns is a slot in `ComponentIconSlotMap`, mapped through
  `componentIcons` as `architecture:icon-resolution-and-component-slots`
  describes. A `true` value declares a stateless slot; an object type declares
  the slot's readonly state fields.
- **FR12 — A slot value is a name, `null`, a static request, or a state resolver.**
  `componentIcons` accepts an `IconName`, `null`, a static partial request, or a
  pure synchronous function of the slot's state that returns a partial request.
  Conceptually:

  ```ts
  type ComponentIconRequest = Readonly<{
    icon?: IconName | null;
    variant?: IconVariant;
    size?: 'xsm' | 'sm' | 'md' | 'lg';
  }>;

  type ComponentIconValue<State> =
    | IconName
    | null
    | ComponentIconRequest
    | ((state: Readonly<State>) => ComponentIconRequest | null | undefined);
  ```

  A stateless slot accepts every form except the function. The component
  supplies its state; the theme handles state combinations in ordinary resolver
  code:

  ```tsx
  componentIcons: {
    'example-nav-item-leading': ({selected}) => ({
      variant: selected ? 'filled' : 'outline',
    }),
  }
  ```

- **FR13 — Partial results fall back field by field.** Icon content passed by the
  caller wins over the slot. Otherwise a request `icon` replaces the component's
  fallback name, and `variant` and `size` apply to whichever name renders. A
  missing `icon` keeps the name the component would otherwise render, a missing
  `variant` keeps the variant the component would otherwise request (or none),
  and a missing `size` keeps the component's size. `null`, a `null` result, or
  `icon: null` hides the icon; an `undefined` result changes nothing.
- **FR14 — A slot size changes only the icon's size.** A resolved `size` replaces
  the component's size for that slot's Icon. The control's height, touch target,
  placement, color, interaction, and accessibility remain set by the component,
  including any outer dimensions a family contract fixes across states.
- **FR15 — Themes set state-dependent icons through slots.** A component that
  exposes a state-dependent icon as a `componentIcons` slot passes that state
  through the slot so the theme can resolve it. A component that picks a shared
  icon name from its own state without a slot keeps doing so until its own
  contract adds one. Per-state icon props passed by a caller, such as
  `pressedIcon` or `selectedIcon`, act as caller-supplied icon content. A
  stateful control mark that a component draws through an indicator, such as the
  selection check, the radio, or the checkbox box, stays an indicator: the
  indicator receives its family's state, and a theme replaces it by name through
  `defineTheme({indicators})`. One visual is never both an indicator and a
  `componentIcons` slot.
- **FR16 — Slot state is documented theme metadata.** A slot's state fields are
  listed with its slot metadata in the owner's component docs and in CLI and
  docsite discovery. Changing a released state field is a compatibility change.

### Reads, built themes, and server rendering

- **FR17 — Slot resolution is the only caller of slot functions.** A component,
  including one in a package that augments `ComponentIconSlotMap`, passes its
  slot state to the shared slot resolution that
  `architecture:icon-resolution-and-component-slots` owns. That resolution calls
  the theme's function and renders the result through `Icon`. No public theme
  read calls or returns a slot function.
- **FR18 — Public reads return nodes and static values.** Registry, extension,
  snapshot, and hook reads, `IconRegistry`, `DefinedTheme['icons']`, and built-theme
  icon exports return React nodes; a function entry is read at `{size: 'md'}`.
  `DefinedTheme['componentIcons']` and built-theme slot exports are a static view:
  names, `null`, and static requests as authored, with resolver slots omitted.
  `DefinedTheme['iconVariants']` is the theme's list. Products request a size or
  variant through `Icon`.
- **FR19 — Runtime, built, and server themes agree.** Runtime themes, `extends`,
  built output, server rendering, and hydration resolve to the same nodes. A
  child theme's entry replaces the inherited entry for the same key. A function
  the build cannot carry fails the build. Server code may resolve icons with a
  theme that holds functions; client code passes that theme to `Theme`.
- **FR20 — Malformed resolver output is treated as missing.** An unknown `icon`,
  a variant the theme does not list, or a size outside the four names in a
  request is ignored field by field, with one development-only warning.

### Platform support

- Supported floor: every React, server-rendering, and browser target supported by
  Astryx Core.
- Unsupported behavior: asynchronous resolvers, and passing a theme that holds
  functions as a prop from a Server Component to a Client Component.
- Browser evidence: theme switching, nested themes, component states, listed and
  unlisted variants, and each Icon size render the expected node at the theme's
  dimension and hydrate to it.

## Current-state impact

Existing node entries, direct icon components, namespaced keys, instance props,
and reads keep working. A theme without `iconVariants`, function entries, or
size styles renders the same icons. These owners carry the change:

- `component:Icon` — registry mode accepts `variant` (FR4, FR5), selects artwork
  with the size resolved by ORD1 (FR9), and its target guarantees `width` and
  `height` on size selectors (FR10).
- `architecture:component-theming-surface` — INV14 admits `Icon.variant` as a
  theme-extensible axis whose fallback is the request without a variant (FR3,
  FR4).
- `architecture:icon-resolution-and-component-slots` — entries are nodes or
  functions and a selected function's result is final (FR1, FR6); the
  never-shipped `selector-selected-option` slot leaves `ComponentIconSlotMap`,
  because Selector draws its selected-option mark through the `check` indicator
  (FR15); slot values are
  `true` or a state shape, and INV3 admits static requests and state resolvers
  (FR11, FR12); INV8 lets a slot request set the slot's icon size and variant
  (FR13, FR14); indicators stay separate (FR15); slot resolution is the only
  caller of slot functions (FR17).
- `architecture:theme-authoring-contract` — `iconVariants`, function entries, and
  slot functions are normalized and inherited, and public reads stay node-valued
  or static (FR2, FR18, FR19).
- `architecture:theme-compilation` — built output reproduces function entries,
  slot resolvers, and the variant list, and build tooling may enumerate a theme's
  requests (FR8, FR19).
- `architecture:theme-application` — client code passes a theme that holds
  functions to `Theme` (FR19).
- Consumer `theme` and `Icon` docs describe `iconVariants`, function entries,
  `variant`, size styling, and slot resolvers.

## Verification

| Contract  | Verification                                                        | Representative states                                                                                                                              | Mutation or failure expectation                                                                              |
| --------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| FR1–FR7   | Registry type, resolver, and Icon render tests                      | node; function; null; omitted, listed, and unlisted variant; no active list; inherited entry under a replaced list; theme, global, default; direct | sources mix, an unlisted variant reaches an entry, `variant` reaches a component or the DOM                  |
| FR2–FR3   | Type tests and theme-build augmentation fixtures                    | listed names in entries and resolvers; child replaces list; built augmentation; unknown name                                                       | an entry sees an unlisted name type, a child merges lists, or Astryx derives one type from two themes' lists |
| FR8       | Build enumeration test against runtime resolution                   | every key × four sizes × no variant and each variant the entry can receive; inherited entry under a replaced list                                  | an enumerated request differs from runtime output, or a variant the entry cannot receive is enumerated       |
| FR9–FR10  | Theme styling and size tests                                        | each size with and without theme styles                                                                                                            | a styled size does not change the glyph dimension, or an unstyled size changes                               |
| FR11–FR16 | Slot type, state, fallback, indicator, geometry, and metadata tests | `true` slot; state slot; static request; partial and full results; `null`; caller content; documented state                                        | fallback order changes, `null` stops hiding, a slot size changes the control, or a mark is both kinds        |
| FR17–FR19 | Public read, SSR, hydration, and runtime/build/extends tests        | one-argument reads; static view; nested themes; child replacement; built function entries; client theme                                            | a public read returns a function, built and runtime results differ                                           |
| FR20      | Type and returned-field tests                                       | invalid state shape; unknown icon; unlisted variant; invalid size                                                                                  | malformed fields change the fallback, or production warns                                                    |

## Decision log

### DEC-1 — One variant request

**Reference:** `spec:AST-087/DEC-1`
**Decider:** cixzhang, 2026-10-22

A variant system is standard across design systems. `Icon` carries one optional
`variant`, and a heavier or lighter stroke is the theme entry's adjustment for
the final size.

Rejected: appearance and weight axes, because they are product-specific.

### DEC-2 — Theme entries are functions of size and variant

**Reference:** `spec:AST-087/DEC-2`
**Decider:** cixzhang, 2026-10-22

A theme entry is a node or a pure synchronous function of the final size and
optional variant that returns supplied artwork, so the theme owns everything
specific to its icon library.

Rejected: per-icon capability declarations and adaptive variant trees.

### DEC-3 — The stylesheet sets icon dimensions

**Reference:** `spec:AST-087/DEC-3`
**Decider:** cixzhang, 2026-10-22

A theme sets the dimension of each Icon size through the Icon stylesheet target.

Rejected: theme-added size names, because a component using one has no value
when the theme is absent.

### DEC-4 — `componentIcons` holds component icons

**Reference:** `spec:AST-087/DEC-4`
**Decider:** cixzhang, 2026-10-22

The global icon map names what each icon is for, and `componentIcons` overrides
it per component slot. A slot can resolve its request from typed component state
in ordinary resolver code.

Rejected: a second component icon map, an icon-role concept, nested per-state
maps, and compound state keys.

### DEC-5 — Themes set state-dependent icons

**Reference:** `spec:AST-087/DEC-5`
**Decider:** cixzhang, 2026-10-22

A state-dependent icon that a component exposes as a slot is a theme decision made
through its resolver, so every instance follows one rule. Indicators keep stateful control marks, because they
draw a family's state rather than choose an icon.

### DEC-6 — A selected function's result is final

**Reference:** `spec:AST-087/DEC-6`
**Decider:** cixzhang, 2026-10-22

Once a function entry is selected, its result answers the request, so artwork
never mixes two sources and a theme can deliberately draw nothing.

### DEC-7 — Products request size and variant through `Icon`

**Reference:** `spec:AST-087/DEC-7`
**Decider:** cixzhang, 2026-10-22

Size- and variant-aware resolution serves Astryx components and tooling. Public
reads return React nodes, reading function entries at `{size: 'md'}`, the
standalone Icon default.

### DEC-8 — Malformed resolver output is ignored field by field

**Reference:** `spec:AST-087/DEC-8`
**Decider:** cixzhang, 2026-10-22

An invalid field in a resolver result is treated as missing, so the fallback
still renders, with one development-only warning.

### DEC-9 — A theme lists its variants once

**Reference:** `spec:AST-087/DEC-9`
**Decider:** cixzhang, 2026-10-22

One theme-level list gives callers typed names, gives build tooling a finite set
of requests to enumerate, and gives an unlisted variant one fallback that does
not depend on the theme: the request without a variant.

Rejected: an open `string`, because it gives callers no types and tooling no
finite set; Astryx deriving one variant type from several themes' lists.

### DEC-10 — Slot functions stay inside slot resolution

**Reference:** `spec:AST-087/DEC-10`
**Decider:** cixzhang, 2026-10-22

Only the shared slot resolution calls a theme's slot function, with the state
the component passes. Public theme data shows a static view, so readers never
handle functions or invent state.

## Open questions

None.
