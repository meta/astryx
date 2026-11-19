---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Button
platform_of: component:Button
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, layout, interaction, theming, accessibility, platform]
verified_by: []
modules: []
families: [family:buttons, family:navigation-destinations]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-085, spec:AST-093, spec:AST-112]
---

# Button (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `Button` under core's name. It takes core's `label`, `variant`, `size`, `elevation`, `isLoading`, `isInterruptible`, `isDisabled`, `icon` (a shared icon name), `children`, `endContent`, `width` (`content` or `fill`), `tooltip`, `onClick`, `clickAction` and `href`, with core's meaning and defaults. It adds `render` (`auto`, `system` or `drawn`: who draws the pixels) and `surface` (`plain` or `glass`). `label` owns the spoken name, `tooltip` the hint and `onClick` the press; a toggle with words is `ToggleButton`. Web's form, element and link-target props stay in the web contract (FR1, FR2, DEC-1).             |
| Behavior                | With `render="auto"`, the default, the system button draws wherever its native piece is present and the Button's shape is one the system button shows; otherwise the Astryx button draws. The theme's `render.default` overrides `auto`. The Astryx button paints the variant from the theme, wraps a long label onto more lines where its width is limited (one line in a bar or a connected group), shows its loading ring in the icon's place or over the label, and opens `href` through the app's link opener. `surface="glass"` draws a glass capsule.                                                                                                |
| End-user impact         | A person gets a button that looks and presses like the platform's own, with a touch target of at least 44 points on iOS and 48 dp on Android. Its words stay whole at every text size, and VoiceOver and TalkBack announce its busy and disabled states.                                                                                                                                                                                                                                                                                                                                                                                                    |
| Builder impact          | An app passes core's Button props, and the same code renders on iOS and Android in both renderings. A Button over a photo or video takes `surface="glass"`; every other part of the look comes from the theme.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Compatibility/readiness | Not yet released; additive. Draft. The core and web contracts are unchanged. Gaps are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Review checks           | Reject a web-only prop accepted and ignored, a platform prop for a concept a core prop owns, a label cut short where the Button has room to wrap outside a compact place, a disabled Button drawn at reduced opacity, a press that runs while disabled or while busy and not interruptible, a rejected `href` that reaches any opener, a busy link that turns into a button, a Button first rendered loading that announces nothing, glass under Reduce Transparency or Increase Contrast, a set `elevation` drawn by the system button, a visual prop other than `surface`, a touch target below the platform minimum, or a third-party native dependency. |
| Governing rules         | `component:Button` FR1–FR13, ORD1–ORD4 and AR4; `family:buttons` AV1; `family:navigation-destinations`; `spec:AST-082` FR3, FR4, FR7, FR10, FR11, FR17 and DEC-2; `spec:AST-093` FR2–FR4; `spec:AST-112` FR21; `spec:AST-123` FR7 and DEC-7; `spec:AST-126` FR2, FR3 and FR10–FR12; `spec:AST-127` FR4; `spec:AST-130`; DEC-1–DEC-4 below.                                                                                                                                                                                                                                                                                                                  |

This table is a review projection; the body below is authoritative.

## Intent

Button is the action control an app reaches for first, so on a phone it has to
press, read and size like the platform's buttons around it. Button on React
Native keeps core's props and states, so a builder who knows the web Button
writes the same call site. It draws with the platform's own button where that
button can show the call site's shape, and with the Astryx button elsewhere,
which follows the platform's press feedback, text sizes and touch targets. This
record states only what React Native adds to `component:Button` or does
differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: not applicable; Button holds no value
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR1 gap: the package's Button does not offer `children`, `endContent` or
  `clickAction`.
- FR2 gap: the package's Button also takes `onPress`, `accessibilityLabel`
  and `accessibilityHint`, React Native's names for the press, the spoken name
  and the hint, which `onClick`, `label` and `tooltip` own; when both `onPress`
  and `onClick` are given, only `onPress` runs.
- FR2 gap: the package's Button also takes `isPressed` and `onPressedChange`
  and draws a toggle, which `ToggleButton` owns.
- FR3 gap: the package spells `render` as `presentation`, with the values
  `default`, `native` and `adaptive-native`, and reads the app provider's
  `nativePresentation` where the theme's `render.default` goes; an unset value
  draws the Astryx button.
- FR4 gap: under the system button, a set `elevation` draws the system's
  floating style (glass on iOS 26 and later) and no shadow, instead of the
  Astryx button.
- FR6 gap: the package spells `surface` as `default` or `glass`, with `default`
  as its default, so an unset Button in a bar keeps its variant's fill instead
  of following the chrome paint.
- FR9 gap: a Button first rendered loading announces nothing; core's
  "Loading" message is announced only when loading starts after mount.
- FR10 gap: under the system button, a disabled or busy Button's long press
  shows no tooltip; the tooltip still reaches screen readers as the hint.

## Ownership boundary

**Owns**

- Which of core's props React Native offers, the props it adds, and the form
  each takes (FR1, FR2).
- Which control draws the Button: the system button or the Astryx button (FR3,
  FR4).
- How the Astryx button lays out its label, paints its variants and states,
  shows loading, and gives press feedback (FR5–FR9, FR12).
- How `tooltip` and `href` behave under a finger (FR10, FR11).
- The glass capsule of `surface="glass"` (FR6).

**Does not own / non-goals**

- The meaning of Button's props, variants, sizes, and pending and disabled
  states — owned by `component:Button`.
- Which destinations a link may open — owned by
  `family:navigation-destinations`.
- The system button's drawing, fitting size and accessibility — owned by
  `spec:AST-126`.
- How glass and material paint — owned by `spec:AST-123`.
- Icon resolution and drawn glyphs — owned by `spec:AST-127`.
- Connected-group seams, shared elevation and inherited disabled state — owned
  by `component:ButtonGroup` under `family:buttons`.
- The icon-only button — owned by `component:IconButton`.
- A pressed state and a toggle with words — owned by `component:ToggleButton`
  (`family:buttons` AV1).
- Tooltip appearance and timing — owned by `component:Tooltip`.

## Public concepts

| Concept     | Closed values or states   | Meaning                                                                                                                                           | Availability by variant/orientation/state                                         | Default                                                                                                       | Owner                           | Stability    | Invalid-value behavior           |
| ----------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------ | -------------------------------- |
| rendering   | `auto`; `system`; `drawn` | who draws the Button's pixels: the platform's button (`system`), the Astryx button (`drawn`), or this component's default (`auto`)                | every Button; a shape the system button cannot show draws the Astryx button (FR4) | `auto`: the system button where its native piece is present, unless the theme's `render.default` overrides it | `spec:AST-126` FR2              | experimental | an unknown value is a type error |
| surface     | unset; `plain`; `glass`   | what the Button sits on: the theme and placement decide (unset), the variant's own fill (`plain`), or the platform's glass as a capsule (`glass`) | every variant                                                                     | unset                                                                                                         | `spec:AST-123` FR7              | experimental | an unknown value is a type error |
| label lines | wrapping; one line        | a long label wraps and the Button grows taller where its width is limited; in a compact place it stays on one line and truncates                  | wrapping outside compact places                                                   | wrapping                                                                                                      | `component:react-native/Button` | experimental | none                             |
| width       | `content`; `fill`         | the web's `"auto"` and `"100%"` (`spec:AST-082` FR4)                                                                                              | every mode                                                                        | `content`                                                                                                     | `component:Button`              | experimental | an unknown value is a type error |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Basis                                                                           | Draft review state |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------ |
| FR1  | React Native's `Button` MUST take core's `label`, `variant`, `size`, `elevation`, `isLoading`, `isInterruptible`, `isDisabled`, `icon`, `children`, `endContent`, `width`, `tooltip`, `onClick`, `clickAction` and `href` with core's names, meaning and defaults. `icon` is a shared icon name (`spec:AST-082` FR4, FR17); `children` and `endContent` take React content, as a platform contract whose implementation runs React may (`spec:AST-082` FR4), and the Button keeps core's naming for them (`component:Button` ORD4); `clickAction` runs after `onClick` and keeps the Button pending until its promise settles, once per in-flight action unless interruptible (`component:Button` FR6, FR7); and `width` is `content` or `fill`. Base props are `id` and `isHidden` (`spec:AST-082` FR7) on the Button's root. It MUST NOT offer web's `type`, `name`, `value`, `form`, `as`, `target`, `rel` or `isIconOnly` (DEC-1). | `component:Button` FR1–FR13, ORD4; `spec:AST-082` FR3, FR4, FR7; DEC-1          | verify             |
| FR2  | React Native MUST add two props, each for a platform reason: `render` (FR3), because a phone has a system button to draw with, and `surface` (FR6), because the same Button sits on a plain page in one place and over a photo in another (`spec:AST-082` DEC-2, `spec:AST-123` DEC-7). It MUST NOT offer a second name for a concept a core prop owns: `label` is the spoken name, `tooltip` the hint (FR10) and `onClick` the press (`spec:AST-082` FR7). It MUST NOT offer a pressed state: a toggle with words is `ToggleButton` (`family:buttons` AV1).                                                                                                                                                                                                                                                                                                                                                                           | `spec:AST-082` FR3, FR7, DEC-2; `spec:AST-123` DEC-7; `family:buttons` AV1      | verify             |
| FR3  | `render` MUST say who draws the Button's pixels (`spec:AST-112` FR21). `system` draws `AstryxNativeButton`: UIButton with UIButton.Configuration on iOS, a Material 3 button on Android (`spec:AST-126` FR3). `drawn` draws the Astryx button. `auto`, the default, is the system button wherever its native piece is present (`spec:AST-082` FR11) and the Astryx button elsewhere, silently, unless the theme's `render.default` overrides every `auto`. `system` where the native piece is absent draws the Astryx button and warns once in development. Under the system button, the props keep their meaning, the theme reaches it through the tokens `spec:AST-126` FR11 lists, and a theme value outside that list is named once in development.                                                                                                                                                                                | `spec:AST-112` FR21; `spec:AST-126` FR2, FR3, FR11; `spec:AST-082` FR11         | verify             |
| FR4  | A Button MUST draw the Astryx button, whatever `render` says, when its shape is one the system button cannot show: `children` or `endContent`, which the system button's title and symbol cannot hold (`spec:AST-126` FR3), `surface="glass"`, a member of a connected group (`ButtonGroup`, `InputGroup`), a set `elevation` (DEC-4), or an `icon` on Android. An `icon` on iOS draws as the system button's SF Symbol.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `spec:AST-126` FR2, FR3; `spec:AST-082` FR3; DEC-4                              | verify             |
| FR5  | The Astryx button's label MUST wrap onto more lines, centred, when its width is limited, and the Button grows taller to hold it, at every text size. In a compact place (a bar, a docked bar, a connected group, a search field's Cancel) the label stays on one line and truncates with an ellipsis, and that place MAY cap how far the label's type grows with the text size. A wrapping label never breaks inside a word: when the platform breaks it inside one, its type steps down until the word fits, never below the default text size.                                                                                                                                                                                                                                                                                                                                                                                       | DEC-2; `component:Button` FR5                                                   | verify             |
| FR6  | `surface` MUST set what the Button sits on for that call site (`spec:AST-123` DEC-7). `plain` draws the variant's own fill. `glass` draws a capsule on the platform's glass, painted as `spec:AST-123` FR7's chrome row chooses: at least the touch target tall, its words and icon never cut, growing with the text size. `primary` tints the glass with `color.accent` and its words take `color.onAccent`; `destructive` words take the error text colour; the other variants take `color.textPrimary`. Where the glass view is present, the press lights the glass. Unset follows the chrome row in a bar, the tab accessory or the search field, and draws `plain` elsewhere. Under Reduce Transparency or Increase Contrast, a glass Button draws the opaque paint with its edge.                                                                                                                                                | `spec:AST-123` FR7, DEC-7; `spec:AST-082` DEC-2                                 | verify             |
| FR7  | The Astryx button MUST size from the theme: height from the element size for its resolved size, grown with the text size, so its label never clips; on Android the `md` height is Material 3's common button height. Inline padding and the gap between icon and label come from the theme's space steps at every size. The touch target reaches 44 points on iOS and 48 dp on Android through hit slop, without changing the look; two Buttons closer than that split the gap between them, so their targets meet and never overlap.                                                                                                                                                                                                                                                                                                                                                                                                  | `component:Button` FR4; `spec:AST-093` FR3                                      | verify             |
| FR8  | `width="content"` MUST size the Button to its content, never past its container: in a row it may shrink (its label then wraps, FR5), and in a column it follows the column's alignment. `width="fill"` takes the line. A member of a vertical connected group stretches to the widest member. Under the system button, `fill` keeps the width its layout gives it and takes only the height (`spec:AST-126` FR10).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `component:Button` FR5; `spec:AST-126` FR10                                     | verify             |
| FR9  | While pending (`isLoading`, or a `clickAction` whose promise has not settled), the Button MUST show the theme's loading ring in the icon's place, or, with no icon, over the label, which keeps its width, so the Button's size does not change; on a Button that is not interruptible and has no action pending, explicit `isLoading` shows the ring at once, and for a pending `clickAction`, or any pending state on an interruptible Button, the ring follows core's delay (`component:Button` FR8). It reads as busy, and a press does nothing unless the Button is interruptible, in which case each press runs `onClick` and starts a new `clickAction`. Core's "Loading" message is announced when loading starts, and a Button first rendered loading announces it on the next frame (`component:Button` AR4). A disabled Button follows FR12 whether or not it is loading.                                                   | `component:Button` FR6–FR10, AR4; `spec:AST-082` FR3                            | verify             |
| FR10 | `tooltip` MUST become the Button's accessibility hint, unless its text repeats the Button's accessible name (ORD5). A long press shows the tooltip only while the Button cannot act (disabled, or busy and not interruptible); on a Button that can act, a long press is a press when the finger lifts, as on a Button with no tooltip. Inside a `Tooltip` whose content is text, those words are the hint, unless the Button has its own `tooltip`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `spec:AST-082` FR3 (a tooltip where there is no hover); `component:Button` FR12 | verify             |
| FR11 | An enabled Button with an `href` that `family:navigation-destinations` accepts MUST read as a link and, on a press, run `onClick` and `clickAction` in core's order and then open the destination through the app's link opener: the `LinkProvider` above it, else the system's URL opener. A rejected destination (`javascript:`, `vbscript:`, an HTML `data:` URL, after core's normalization) reaches no opener, and the Button stays a button that runs `onClick`. A disabled Button with `href` is a disabled button that never opens. A busy Button with `href` stays a link and opens nothing until loading ends, unless it is interruptible.                                                                                                                                                                                                                                                                                   | `component:Button` FR6, FR9, FR11; `family:navigation-destinations`             | verify             |
| FR12 | A disabled Button (`isDisabled`, or a disabled connected group) MUST never run `onClick` or open its link, and it reads as disabled. The Astryx button draws it with the theme's disabled colours, `color.backgroundMuted` behind `color.textDisabled` words (a `ghost` Button keeps no fill), never with reduced opacity (DEC-3). A disabled Button with a `tooltip` keeps its long press for the tooltip (FR10).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `component:Button` FR10; DEC-3                                                  | verify             |

### Allowed variation

- **AV1 — The platform's press feedback.** The Astryx button's press shows the
  platform's own response, a highlight on iOS and a ripple cut to the Button's
  corners on Android, with core's press shrink. The system button's press,
  focus ring and motion are the system's own and may change with each OS
  release.
- **AV2 — The system's glass.** In a glass capsule, refraction, the light under
  a finger and the glass's motion are the system's own.
- **AV3 — Platform heights.** The `md` height differs between iOS and Android
  (FR7).

### Representative states

| State                                                | Required invariant                                                          | Allowed variation      |
| ---------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------- |
| at rest, `render` unset                              | the system button where its native piece is present; else the Astryx button | the system's look      |
| long label in a narrow column                        | the label wraps; the Button grows taller                                    | line breaks            |
| long label in a bar                                  | one line, truncated                                                         | the cap on text growth |
| loading with an icon                                 | the ring in the icon's place; same size; busy                               | the ring's look        |
| loading, no icon                                     | the ring over the label, which keeps its width                              | the ring's look        |
| disabled                                             | disabled colours, no opacity; no press                                      | none                   |
| disabled with `tooltip`                              | a long press shows the tooltip                                              | tooltip placement      |
| enabled with an accepted `href`                      | a link; the press opens through the app's opener                            | the opener             |
| `href` rejected                                      | a button; no opener runs                                                    | none                   |
| `surface="glass"`                                    | a capsule on glass; words never cut                                         | the system's glass     |
| glass under Reduce Transparency or Increase Contrast | opaque paint with its edge; no glass                                        | none                   |
| largest text size                                    | the height grows; the label wraps and never breaks inside a word            | none                   |

### Transformation and precedence order

- **ORD1 — Size.** An explicit `size`, then the slot size of the component that
  holds the Button, then `md` (`component:Button` ORD1).
- **ORD2 — Availability.** Disabled, then busy-only, then operable.
  Interruptible busy is operable (`component:Button` ORD2).
- **ORD3 — Control.** A shape the system button cannot show draws the Astryx
  button (FR4); then an explicit `system` or `drawn`; then, for `auto`, the
  theme's `render.default`; then the system button where its native piece is
  present, else the Astryx button.
- **ORD4 — Role.** A link (enabled with an accepted `href`), then a button.
- **ORD5 — Spoken words.** The name follows `component:Button` ORD4: `label`
  when the Button is pending or its `children` differ from `label`; otherwise
  its rendered content, the text in the `icon` slot, the label and the text in
  `endContent`, so `endContent` that reads "3" makes an "Inbox" Button "Inbox
  3" on every platform. The hint is the Button's `tooltip` when it does not
  repeat that name, else a wrapping `Tooltip`'s words.
- **ORD6 — Look.** Under Reduce Transparency or Increase Contrast a glass
  surface is opaque; then `surface`; then the disabled colours; then the variant's fill. The theme's component overrides for
  Button apply over the Button's own styles, a connected group's corners and
  seams apply over both, and a glass capsule keeps its own fill and corners.

### Performance and resources

- **PR1 — No idle work.** A Button holds no timers or tasks; loading is a prop
  the caller sets.
- **PR2 — Word fit only where it can apply.** The label's word-fit step (FR5)
  runs only above the default text size, at most one step per layout, and
  starts over only for new words, a new text size or a new window width.
- **PR3 — The system button sizes once.** The system button's first frame
  already has its final size (`spec:AST-126` FR10).

## Accessibility contract

- **AR1 — Name, role and state.** One accessibility element per Button, named
  as ORD5 states, with the role of ORD4 and its disabled and busy states. Under
  the system button, the busy word is its value (`spec:AST-126` FR12).
- **AR2 — Text size.** The label scales with Dynamic Type and Android's font
  scale; the Button grows taller and the label wraps rather than clips (FR5,
  FR7), and a glass capsule grows with it (FR6).
- **AR3 — Touch target.** Every Button keeps the platform's minimum touch
  target without changing its look (FR7).
- **AR4 — Reduced motion.** With Reduce Motion, the Astryx button does not
  shrink on a press; the highlight or ripple still shows.
- **AR5 — Keyboard focus.** With a hardware keyboard, the Astryx button draws
  the theme's focus ring, in the error colour on `destructive`; the system
  button draws the platform's focus.
- **AR6 — Contrast settings.** Under Reduce Transparency or Increase Contrast, a
  glass Button keeps a solid, visible background behind its words (FR6).

## Design relationships

| Anatomy or state | Design requirement                                                | Representation authority   | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Fill and words   | the variant's theme colours; disabled colours when disabled       | theme intent               | prominent      | FR7, FR12          |
| Label            | wraps where the width is limited; one line in compact places      | prescribed by the platform | prominent      | FR5                |
| Loading ring     | in the icon's place or over the label                             | theme intent               | supporting     | FR9                |
| Glass capsule    | the platform's glass, or the opaque paint under contrast settings | prescribed by the platform | supporting     | FR6                |
| Press feedback   | the platform's highlight or ripple                                | prescribed by the platform | supporting     | AV1                |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): UIButton with UIButton.Configuration on
iOS and a Material 3 button on Android, through `AstryxNativeButton`, which
show the call sites FR4 does not exclude. The Astryx button is a React Native
`Pressable` with the platform's press feedback, for the shapes the system
button cannot show and for an app that picks `drawn`. Guideline pages: Buttons,
Materials (Liquid Glass) and Accessibility (Dynamic Type, Reduce Motion, Reduce
Transparency, Increase Contrast) in the Apple Human Interface Guidelines;
Buttons and Accessibility (touch targets) in Material 3 (`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): `color.accent`, `color.onAccent`,
`color.neutral`, `color.textPrimary`, the error fill and error text colours,
`color.onError`, `color.backgroundMuted` and `color.textDisabled` (disabled),
the focus outline width, offset and colour, `size.elementSm`,
`size.elementMd` and `size.elementLg`, `radius.element`, `space` steps for
padding and gap, `font.label` in `font.family.body` at the medium weight, the
`shadow.low`, `shadow.med` and `shadow.high` layers, the text size scale, the
theme's component overrides for Button (`spec:AST-082` DEC-2), the native
theme's `material` intent (`spec:AST-082` FR10) and `render.default`
(`spec:AST-112` FR21), and the theme's button shape for the system button
(`spec:AST-126` FR11).

### Native pieces

| Native piece                            | Record                        | What this record uses it for                                                                              |
| --------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AstryxNativeButton`                    | `spec:AST-126` FR3, FR10–FR12 | the system button: its variants, sizes, SF Symbol, states, fitting size and accessibility (FR3, FR4, FR8) |
| `AstryxGlassView`, `AstryxMaterialView` | `spec:AST-123` FR7            | the glass capsule of `surface="glass"` and its paint choice (FR6)                                         |
| `Icon` resolution                       | `spec:AST-127` FR4            | the `icon` slot: a defined icon, else the platform's symbol, else a drawn glyph (FR1, FR4)                |
| React Native `Linking`                  | `spec:AST-130`                | the system's URL opener when no `LinkProvider` is above (FR11)                                            |

## Family and system relationships

- `component:Button` owns the props, the pending and disabled states, and link
  mode; this record states how React Native draws them.
- `family:buttons` owns the button family; `component:ButtonGroup` owns a
  connected group's seams, elevation and disabled state, which the Astryx
  button paints (FR4, FR12); `component:ToggleButton` owns a toggle with words.
- `family:navigation-destinations` owns which destinations open (FR11).
- `spec:AST-126` owns the system button and the `render` mapping;
  `spec:AST-123` owns glass and material paint; `spec:AST-127` owns icons.
- `component:IconButton` owns the icon-only button, and shares `surface` with
  this component (`spec:AST-123` DEC-7).

## Verification map

| Contract       | Verification                                                                                                     | Representative states                                                                                                                                                                     | Mutation or failure expectation                                                                                                                                                                    | Audit section                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| FR1, FR2       | Type tests against core's Button contract; the contract check of each platform's props                           | each core prop, `children`, `endContent` and `clickAction` included; `render`; `surface`; each web-only prop; React Native's names for a press, a spoken name and a hint; a pressed state | a web-only prop that type-checks, a missing core prop, a second name for a concept a core prop owns, a pressed state, a renamed core prop, or an accepted and ignored prop fails                   | `audit:react-native/Button/api`     |
| FR3, FR4, ORD3 | Unit tests of the control choice through the testing doubles, with and without the native piece                  | `render` unset, `system`, `drawn`; a theme `render.default`; `children`; `endContent`; glass; a connected group; a set `elevation`; an icon on Android                                    | a system button for a shape it cannot show, a silent fallback under `system`, or `auto` that ignores the theme fails                                                                               | `audit:react-native/Button/render`  |
| FR5, PR2, AR2  | Unit tests of label layout; captures at the default and largest text sizes                                       | a narrow column; a bar; a connected group; a capped compact place; a word wider than the line                                                                                             | a label cut where it can wrap, a compact label on two lines, or a word broken inside fails                                                                                                         | `audit:react-native/Button/label`   |
| FR6, AR6       | Unit tests of each paint with the doubles and contrast settings; simulator and emulator captures, light and dark | each variant in glass; unset in a bar and in a form; Reduce Transparency; Increase Contrast; the largest text size                                                                        | glass under a contrast setting, cut words, an unset Button in a bar off the chrome row, or a `plain` Button on glass fails                                                                         | `audit:react-native/Button/glass`   |
| FR7, FR8, AR3  | Unit tests of heights, placement and hit slop on each platform                                                   | each size; `md` on Android; two Buttons close together; `content` and `fill` in rows and columns                                                                                          | a height below the element size, an Android `md` below Material's height, overlapping targets, or a Button wider than its container fails                                                          | `audit:react-native/Button/layout`  |
| FR9, FR12      | Unit tests of loading, pending actions and disabled states                                                       | loading with and without an icon; first rendered loading; a pending `clickAction`, fast and slow; a double press; interruptible; disabled; disabled and loading                           | a size change, a press that runs while blocked, a second `clickAction` while one is in flight, a Button first rendered loading that announces nothing, or a disabled look drawn with opacity fails | `audit:react-native/Button/states`  |
| FR10, ORD5     | Unit tests of names, hints and the long press                                                                    | a tooltip; a tooltip equal to the name; `endContent` with text; `children` that differ from `label`; a pending Button; a wrapping `Tooltip`; disabled with a tooltip                      | a name that differs from core's for the same props, a hint that repeats the name, or a long press that shows a tooltip on a Button that can act, fails                                             | `audit:react-native/Button/tooltip` |
| FR11           | Unit tests of `href` with and without a `LinkProvider`                                                           | accepted; rejected; disabled; busy; interruptible                                                                                                                                         | a rejected destination that reaches an opener, a disabled Button that opens, or a busy link that becomes a button fails                                                                            | `audit:react-native/Button/link`    |
| AR1, AR4, AR5  | VoiceOver and TalkBack checks; Reduce Motion and keyboard checks                                                 | idle; loading; disabled; link                                                                                                                                                             | a lost name, role or state, a shrink under Reduce Motion, or no focus ring fails                                                                                                                   | `audit:react-native/Button/a11y`    |

## Decision log

### DEC-1 — React Native keeps core's Button; web-only props stay on the web

**Reference:** `component:react-native/Button/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

React Native's Button takes core's props with core's names and meaning, so a
call site reads the same on the web and on a phone. The web contract keeps what
an app platform has no honest form for (`spec:AST-082` FR3): the HTML form
props (`type`, `name`, `value`, `form`), because an app has no HTML form to
submit; `target` and `rel`, because an app opens every link through the system;
and `as`, a web component reference. The icon-only button is `IconButton`, so
`isIconOnly` stays on the web.

### DEC-2 — A long label wraps where the width is limited

**Reference:** `component:react-native/Button/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

The Astryx button's label wraps onto more lines and the Button grows taller
when its width is limited, at every text size, as UIKit's configured buttons
and SwiftUI's bordered buttons do. A person at a large text size then reads the
whole action instead of an ellipsis. A compact place keeps one line, as the
platforms keep bar items on one line, so a bar or a connected group keeps its
height.

### DEC-3 — Disabled uses the theme's disabled colours

**Reference:** `component:react-native/Button/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

A disabled Button draws the theme's disabled fill and words, as the platforms'
own buttons draw a disabled button. Its words then keep the contrast the theme
sets for disabled text, whatever lies behind the Button.

### DEC-4 — A set `elevation` draws the Astryx button

**Reference:** `component:react-native/Button/DEC-4`
**Decider:** imdreamrunner, 2026-11-18

`elevation` is a resting shadow depth (`component:Button` FR13), and the system
button has no shadow scale for `low`, `med` and `high`. A Button with a set
`elevation` therefore draws the Astryx button, which paints the theme's shadow
layer, whatever `render` says. Glass comes only from `surface`
(`spec:AST-123` DEC-7), never from `elevation`.

## Open questions

- **OQ1 — Does a glass Button use the system button's glass style under
  `system`?** (`human-api`) `spec:AST-126` FR2 draws the Astryx button for
  `surface="glass"` (FR4), and `spec:AST-112` FR21 says a system-drawn button
  shows its surface as the platform's matching button style. Options: the
  Astryx glass capsule whatever `render` says (FR4 and FR6 as written); or the
  system button's glass style under `system` on iOS 26 and later, and the
  Astryx capsule elsewhere.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
