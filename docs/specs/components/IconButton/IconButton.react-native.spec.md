---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/IconButton
platform_of: component:IconButton
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, layout, theming, accessibility, platform]
verified_by: []
modules: []
families: [family:buttons]
design_specs: [design:reduced-motion]
architecture:
  [architecture:component-size-cascade, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093, spec:AST-112]
---

# IconButton (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `IconButton` under core's name (DEC-1). It takes core IconButton's props with core's meaning and defaults, `width` as `content` or `fill`, and none of the web contract's props (`clickAction`, `type`, `name`, `value`, `form`, `as`, `target`, `rel`). Its React Native contract adds a toggle (`isPressed`, `onPressedChange`, `pressedIcon`), a count (`count`, `countLabel`, `isCountVisible`), the size `xl`, and `surface` (`plain` or `glass`). `icon` and `pressedIcon` take an icon name or a React element. |
| Behavior                | One square press target on React Native Button's press engine, named by `label`, showing only its icon. With `isPressed` it is a toggle with ToggleButton's names; with a `count` it draws a number beside the glyph inside the same target; `xl` is a larger square for media transport rows; `surface="glass"` draws a circle at least the touch target on chrome glass, painted as `spec:AST-123` FR7 chooses.                                                                                                                           |
| End-user impact         | A person gets a compact action with the platform's touch target and press feedback. VoiceOver and TalkBack read its name, its pressed state and its count as one element. A glass control over a photo or a video stays readable, and turns solid under Reduce Transparency or Increase Contrast.                                                                                                                                                                                                                                           |
| Builder impact          | An app writes core's IconButton props. An engagement row (Like, Save) uses `isPressed`, `pressedIcon` and `count`; a media transport row uses `xl`; a control floating over content or media sets `surface="glass"`.                                                                                                                                                                                                                                                                                                                        |
| Compatibility/readiness | Not yet released; additive. Draft. Gaps are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Review checks           | Reject a web contract prop offered on React Native, visible label text, a square that a row can shrink, a slot size that resolves to `xl`, a toggle that opens a link, a count read apart from the name, a glass circle smaller than the touch target, glass drawn under Reduce Transparency or Increase Contrast, a glass look taken from anywhere but `surface`, the theme and the accessibility settings, or a visual prop other than `surface`.                                                                                         |
| Governing rules         | `component:IconButton` FR1–FR4 and AR1–AR4; `component:Button` FR7–FR13 and FR15; `component:ToggleButton`; `family:buttons` FR1, FR3, FR4, FR6, FR7 and AV4; `spec:AST-082` FR3, FR5, FR7, FR11, FR17 and DEC-2 (as amended); `spec:AST-093` FR2–FR4; `spec:AST-123` FR1, FR3, FR7 and FR10; `spec:AST-127` FR4 and FR9; `spec:AST-130` FR6; DEC-1–DEC-4 below.                                                                                                                                                                            |

This table is a review projection; the body below is authoritative.

## Intent

IconButton on React Native is core's icon-only action, drawn with React
Native's `Pressable` on the same press engine as React Native's Button, so
presses, focus, touch targets and screen readers work the platform's way while
its name, look and states follow `component:IconButton`. It also carries what
phone apps put in icon-only buttons: an on and off state with a filled glyph, a
count beside the glyph, a larger size for media transport rows, and a glass
circle for controls that float over content. This record states only what
React Native adds to `component:IconButton` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: `isPressed` is controlled; the button holds
  no pressed state of its own
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR2 gap: the package also takes `onPress`, `accessibilityLabel`,
  `accessibilityHint` and `hint`, second inputs for the press, the spoken name
  and the description that `onClick`, `label` and `tooltip` own; with `onPress`
  and `onClick` both set, `onClick` does not run.
- FR6 gap: a toggle's press calls `onPressedChange` before `onClick`.
- FR8 gap: the package spells `plain` as `default` and makes it the default, so
  an unset IconButton in a bar, the tab accessory or the search field keeps its
  variant's fill instead of the chrome paint.
- FR8 gap: the package also takes `surface="muted"`, a 30 pt filled circle with
  a 16 pt glyph in the secondary icon colour that reaches the touch target by
  hit slop (a sheet title bar's close), a value FR8 does not list.

## Ownership boundary

**Owns**

- IconButton's React Native contract: the core props it offers, and its React
  Native platform props (FR1, FR2).
- The icon-only square on React Native and the `xl` size (FR3, FR4).
- The toggle and the count (FR6, FR7).
- How `surface` draws on IconButton: the glass circle, its size, its ink and
  its press response (FR8, FR9).

**Does not own / non-goals**

- The meaning of IconButton's props, its icon-only mode and its name rule —
  owned by `component:IconButton`.
- Press, link, loading, disabled, tooltip, focus, width, elevation, press
  feedback and the touch target — owned by `component:react-native/Button`.
- The pressed state's names and meaning — owned by `component:ToggleButton`.
- The glass and material paints, the native glass views and the settings that
  choose a paint — owned by `spec:AST-123`.
- Icon resolution and drawn glyphs — owned by `spec:AST-127`.
- Haptic moments and opening a link — owned by `spec:AST-130`.

## Public concepts

| Concept | Closed values or states                  | Meaning                                                                                                 | Availability by variant/orientation/state | Default                                          | Owner                               | Stability    | Invalid-value behavior                 |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------ | ----------------------------------- | ------------ | -------------------------------------- |
| size    | `sm`; `md`; `lg`; `xl`                   | core's three element sizes, and `xl`, a square a third larger than `lg` for media transport rows        | every variant                             | the slot's size, else `md`; `xl` only when set   | `component:react-native/IconButton` | experimental | an unknown value is a type error       |
| toggle  | action; unpressed toggle; pressed toggle | `isPressed` undefined is a plain action; a boolean makes a toggle in that state                         | every variant and size                    | action                                           | `component:react-native/IconButton` | experimental | none                                   |
| count   | none; drawn and spoken; spoken only      | a non-zero `count` beside the glyph, read after the name; `isCountVisible={false}` keeps it spoken only | every variant, size and toggle state      | none                                             | `component:react-native/IconButton` | experimental | `0` or no `count` draws and reads none |
| surface | unset; `plain`; `glass`                  | what the button sits on: its variant's fill, or chrome glass (FR8)                                      | every variant and size                    | unset: follows the placement and the theme (FR8) | `spec:AST-082` DEC-2                | experimental | an unknown value is a type error       |
| width   | `content`; `fill`                        | the web's `auto` and `100%`                                                                             | every variant and size                    | the square                                       | `component:IconButton`              | experimental | any other value is a type error        |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Basis                                                                                                              | Draft review state |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------ |
| FR1 | React Native MUST export the component as `IconButton`, the name it has on every platform (`spec:AST-082` FR3), and take core IconButton's props with core's names, meaning and defaults: `label`, `icon`, `variant`, `size`, `elevation`, `isLoading`, `isInterruptible`, `isDisabled`, `tooltip`, `onClick`, `width` and `href`, with the base props `id` and `isHidden` (`spec:AST-082` FR7). `width` takes `content` and `fill`, the web's `auto` and `100%`. The web contract's props (`clickAction`, `type`, `name`, `value`, `form`, `as`, `target`, `rel`) are not offered, and using one is a type error. `style` and `testID` are not props; `id` sets the view's test id and native id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `component:IconButton` FR1; `spec:AST-082` FR3, FR5, FR7; DEC-1                                                    | verify             |
| FR2 | IconButton's React Native contract MUST add, on iOS and Android alike, the toggle (FR6), the count (FR7), the size `xl` (FR4) and `surface` (FR8), and no second input for a concept a core prop owns: `label` owns the spoken name, `onClick` the press, and `tooltip` the description (`spec:AST-082` FR7). `icon` and `pressedIcon` take a shared icon name, which resolves through `Icon` (`spec:AST-082` FR17, `spec:AST-127` FR4), or a React element, which draws as given inside the icon slot's size and the button's ink.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `spec:AST-082` FR3, FR5, FR7, DEC-6; DEC-1, DEC-2                                                                  | verify             |
| FR3 | IconButton MUST render one press target in icon-only mode with the caller's icon and no visible text, named by `label` (`component:IconButton` FR1, FR2). Without `width` or a drawn count it is a fixed square whose side is the theme's element size for its size (`size.elementSm`, `size.elementMd`, `size.elementLg`), grown with the system text size, with no padding; no row (a wrapping stack, a Toolbar) shrinks it. An icon name draws at `sm` in `sm` and `md` buttons and at `md` in `lg` ones (`component:IconButton` FR3). Without `size` it takes its slot's size, else `md` (`architecture:component-size-cascade`). `width="fill"` takes the row's width.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `component:IconButton` FR1–FR3; `family:buttons` FR7; `architecture:component-size-cascade`                        | verify             |
| FR4 | `size="xl"` MUST draw a square a third larger than `lg` (`size.elementLg` × 4/3) holding a glyph a third larger than core Icon's `lg`, both grown with the text size, with `lg`'s ink, spinner and theme overrides. A slot's size never resolves to `xl`: a caller sets it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | DEC-3                                                                                                              | verify             |
| FR5 | Press, link, loading, disabled, tooltip, focus, width, elevation, press feedback, touch target and theme overrides MUST follow `component:react-native/Button`, with the square in place of a label. A press runs `onClick`, then opens an accepted `href` through the app's opener (`spec:AST-130`); an enabled IconButton with an accepted `href` has the link role, and a script `href` is inert and leaves a button (`family:navigation-destinations`). While loading, the spinner takes the icon's place, the size holds, the button is busy, presses wait unless it is interruptible, and the loading message is announced once. A disabled IconButton never runs `onClick`. The press target reaches the platform's touch target (44 pt on iOS, 48 dp on Android) by hit slop around the visible square. The tooltip is the accessibility hint unless it repeats the name, and a long press shows it while the button cannot act. The theme's Button overrides apply without their padding, so the glyph keeps its square.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `component:IconButton` FR4; `component:Button` FR7–FR13, FR15; `family:buttons` FR3, FR4; `spec:AST-082` FR3, FR11 | verify             |
| FR6 | With `isPressed` set, IconButton MUST be a toggle with core ToggleButton's names and pressed-state meaning (`component:ToggleButton`). A press runs `onClick`, then calls `onPressedChange` with the next state, in ToggleButton's order (`component:ToggleButton` FR3, `family:buttons` FR5), and plays the library's toggle haptic moment (`spec:AST-130` FR6); React Native's callbacks take no event, so `onClick` does not cancel the toggle. It exposes the pressed state: on iOS a toggle button with its checked value, on Android a button with the selected state and "not selected" in its value when unpressed. It draws ToggleButton's pressed fill on `secondary` and `ghost`, keeps the fill of `primary` and `destructive`, and shows `pressedIcon` while pressed; a `ghost` toggle with a `pressedIcon` keeps no fill, so the glyph alone carries the state. A toggle is an action: with `isPressed` set, `href` opens nothing and the role stays a toggle (`family:buttons` AV4). A touch that travels past the press slop does not toggle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `component:ToggleButton` FR3; `family:buttons` FR5, FR6, AV4; DEC-2                                                | verify             |
| FR7 | A non-zero `count` MUST draw beside the glyph, in the label type with tabular figures and the button's ink, inside the same press target, formatted for the locale; `countLabel` replaces the drawn and spoken words (a compact "1.2K"). The square becomes a pill as tall as the square and at least as wide, with `space.s1` before the glyph, between the glyph and the count, and after the count (`space.s2` at the ends for `lg` and `xl`); no row shrinks it. The count is read after the name as one element ("Like, 12"). `isCountVisible={false}` keeps the count in the spoken name without drawing it, and the square stays. A counted toggle keeps FR6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | DEC-2                                                                                                              | verify             |
| FR8 | `surface` MUST take `plain` or `glass` and have no default (`spec:AST-082` DEC-2 as amended; `spec:AST-123` FR1). `plain` draws the variant's own fill (FR3, FR5). `glass` draws FR9's circle on chrome glass, painted as `spec:AST-123` FR7's chrome row chooses. An unset `surface` follows the chrome row in a bar, the tab accessory or the search field, and draws `plain` elsewhere (`spec:AST-123` FR7). `surface` is a per-call-site choice: each use picks the surface that fits where the IconButton sits, and the native theme's `material` member decides how that surface looks (`spec:AST-082` FR10). `surface` is IconButton's only visual prop; every other look comes from the theme (`spec:AST-093` FR4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `spec:AST-082` DEC-2, FR10; `spec:AST-123` FR1, FR7, DEC-7                                                         | verify             |
| FR9 | A glass IconButton MUST be a circle at least the touch target: for `sm`, `md` and `lg`, 44 pt on iOS and 48 dp on Android, or the element size when that is larger; for `xl`, 48 pt or the `xl` square when that is larger. At `sm` and `md` it holds a `md` glyph. A glass `lg` is a close control on a sheet or a bar: its glyph frame is the `xl` glyph's, so the drawn mark matches the size of the system's close button. A glass `xl` is a media control over a photo or a video: it holds core Icon's `lg` glyph, so the circle keeps the system's media controls' margin around the mark. On iOS the circle and its glyph keep one size at every text size, as the system's glass buttons do, and the Large Content Viewer shows its name and glyph (`spec:AST-127` FR9); on Android both grow with the text size. The ink keeps the variant's meaning: `primary` draws `color.onAccent` on glass tinted `color.accent`, `destructive` draws the error colour at text contrast, and the other variants draw `color.textPrimary`. Where the glass view paints, the glyph sits inside the glass, which is the press response (`spec:AST-123` FR3, DEC-1). Elsewhere the circle has a `color.neutral` fill (`primary`: `color.accent`) and a rim at the theme's border width, over the material or as the whole look, so it never disappears into a surface of its own colour. Under Reduce Transparency or Increase Contrast the circle is opaque: `color.backgroundSurface` under the `color.neutral` tint, with `spec:AST-123` FR7's outline for that setting. In a dark appearance with Reduce Bright Effects on, a press dims the circle instead of brightening it. Label, role, toggle, count, loading and disabled behave as FR5–FR7 in glass. | `spec:AST-123` FR3, FR7, FR10; `spec:AST-082` FR11; `spec:AST-093` FR3; DEC-4                                      | verify             |

### Allowed variation

- **AV1 — Platform press feedback.** The ripple on Android, the pressed overlay
  on iOS, and the system glass's own press response, refraction and edge are
  the platform's and may change with each OS release.
- **AV2 — Icon content.** Any element may fill the icon slot; IconButton does
  not inspect it.

### Representative states

| State                                       | Required invariant                                                        | Allowed variation           |
| ------------------------------------------- | ------------------------------------------------------------------------- | --------------------------- |
| at rest                                     | a fixed square named by its name; icon only; the touch target by hit slop | variant, size, theme paint  |
| in a wrapping row                           | the square keeps its side                                                 | none                        |
| loading                                     | the spinner in the icon's place; busy; the same size; announced once      | the spinner is the system's |
| disabled with a tooltip                     | never runs `onClick`; a long press shows the tooltip                      | none                        |
| pressed toggle, `ghost`, with `pressedIcon` | the pressed icon, no fill; pressed state exposed                          | none                        |
| pressed toggle with `href`                  | a toggle that opens nothing                                               | none                        |
| `count={12}`                                | a pill with "12" after the glyph; read "Like, 12"                         | the locale's digits         |
| `count={12}`, `isCountVisible={false}`      | the square; read "Like, 12"                                               | none                        |
| `xl`                                        | the `xl` square and glyph; never from a slot                              | none                        |
| `surface="glass"`, iOS, largest text size   | the circle and glyph keep their size; the Large Content Viewer shows them | the system's glass          |
| `surface="glass"`, Reduce Transparency      | an opaque circle with an outline                                          | none                        |

### Transformation and precedence order

- **ORD1 — Press.** A blocked button (disabled, or loading and not
  interruptible) does nothing. Otherwise `onClick` runs, then a toggle calls
  `onPressedChange` with the next state, and a button that is not a toggle opens
  an accepted `href`.
- **ORD2 — Spoken words.** Name: `label`, with the count after it. Hint: the
  tooltip unless it repeats the name, then the words of a `Tooltip` around the
  button.
- **ORD3 — Size.** An explicit `size`, then the slot's size, then `md`; `xl`
  only from an explicit `size`.
- **ORD4 — Surface paint.** Reduce Transparency or Increase Contrast (opaque),
  then `surface`, then the placement of an unset `surface`, then the theme's
  `material` (`spec:AST-123` FR7).

### Performance and resources

- **PR1 — No added work.** IconButton adds no state, timer or listener beyond
  the shared press engine's; a glass circle mounts one glass view.

## Accessibility contract

- **AR1 — Name.** `label` is the only spoken name;
  the icon is decorative and never substitutes for it (`family:buttons` FR1).
  A count is read after the name, in the same element (FR7).
- **AR2 — Role and state.** A button, or a link with an enabled, accepted
  `href`; a toggle exposes its pressed state as FR6 states. Busy and disabled
  states follow `component:react-native/Button`, and loading is announced once.
- **AR3 — Touch target.** Every IconButton's press target reaches 44 pt on iOS
  and 48 dp on Android (`spec:AST-082` FR11); a glass circle is at least that
  size itself (FR9).
- **AR4 — Text size.** The square, its glyph and the count grow with Dynamic
  Type and Android's font scale. On iOS a glass circle keeps one size and shows
  the Large Content Viewer with its name and glyph.
- **AR5 — Contrast and motion settings.** Under Reduce Transparency or
  Increase Contrast a glass circle is opaque with an outline (FR9). Under
  Reduce Motion the press does not shrink the button
  (`design:reduced-motion` DR1), and a press still shows its fill.

## Design relationships

| Anatomy or state | Design requirement                                             | Representation authority   | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Square surface   | the variant's fill at the element size, square                 | theme intent               | prominent      | FR3, FR4           |
| Icon             | the only visible content, sized from the button                | theme intent               | prominent      | FR3, FR4           |
| Pressed toggle   | ToggleButton's pressed fill and the pressed icon               | theme intent               | prominent      | FR6                |
| Count            | label type with tabular figures beside the glyph               | theme intent               | supporting     | FR7                |
| Glass circle     | the system's Liquid Glass at the touch target, or its fallback | prescribed by the platform | supporting     | FR8, FR9           |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): React Native's `Pressable`, as for
Button; React Native's `Button` cannot draw an icon or take the theme. Guideline
pages: Buttons, Toggles, Materials (Liquid Glass) and Accessibility (Large
Content Viewer, Reduce Transparency, Increase Contrast, Reduce Motion) in the
Apple Human Interface Guidelines; Icon buttons and Buttons in Material 3
(`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): the Button colours of each variant and
ToggleButton's pressed fill; `size.elementSm`, `size.elementMd`,
`size.elementLg` and `size.borderWidth`; `space.s1` and `space.s2`;
`radius.element`; `font.label`; the `shadow` layers for `elevation`; for glass,
`color.neutral`, `color.accent`, `color.onAccent`, `color.textPrimary`, the
error colour, `color.backgroundSurface`, the border colours of
`spec:AST-123` FR7's outline, and the native theme's `material` intent
(`spec:AST-082` FR10); the theme's Button component overrides; and the system
text-size scale.

### Native pieces

| Native piece                  | Record                  | What this record uses it for                                                               |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| `AstryxGlassView`             | `spec:AST-123` FR3      | the glass circle with the glyph inside, which responds to the press (FR9)                  |
| `AstryxMaterialView`          | `spec:AST-123` FR2      | the material behind the glyph where the glass view does not paint (FR9)                    |
| `AstryxAccessibilitySettings` | `spec:AST-130` FR5      | Reduce Transparency, Increase Contrast and Reduce Bright Effects for the glass paint (FR9) |
| `Icon` resolution             | `spec:AST-127` FR4      | a defined icon, a system symbol or a drawn glyph for each icon name (FR2)                  |
| `AstryxVectorView`            | `spec:AST-127` FR7, FR9 | drawn glyphs, and the glass circle's Large Content Viewer image on iOS (FR9, AR4)          |
| `AstryxHaptics`               | `spec:AST-130` FR6      | the toggle haptic moment (FR6)                                                             |
| React Native `Linking`        | `spec:AST-130`          | opening an accepted `href` through the library's link helper (FR5)                         |

## Family and system relationships

- `component:IconButton` owns the props, the icon-only mode and the name rule;
  this record states how React Native draws them and what React Native adds.
- `component:react-native/Button` owns the press engine both buttons share
  (FR5).
- `component:ToggleButton` owns the pressed state's names and meaning.
  `family:buttons` AV1 gives retained pressed state to ToggleButton; on React
  Native this component deliberately differs: an IconButton with `isPressed` is
  a controlled toggle under ToggleButton's names (DEC-2).
- `spec:AST-082` DEC-2 (as amended) and `spec:AST-123` own `surface`'s values
  and how each surface paints; this record owns the glass circle's geometry and
  ink.
- `spec:AST-127` owns icon resolution and drawn glyphs; `spec:AST-130` owns the
  haptic moments and the settings snapshot.

## Verification map

| Contract     | Verification                                                                                                                            | Representative states                                                                                     | Mutation or failure expectation                                                                                                            | Audit section                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| FR1, FR2     | Type tests of accepted and rejected props; a contract drift test against core's IconButton contract                                     | each core prop; each web contract prop; `style`, `testID`                                                 | an offered web prop, a renamed core prop, an accepted and ignored prop, or a second input for the name, the press or the description fails | `audit:react-native/IconButton/api`      |
| FR3, ORD3    | Unit tests through the package's testing doubles (`spec:AST-112` FR15) at several text scales                                           | `sm`, `md`, `lg` alone and in a wrapping row; a slot size; `width="fill"`                                 | a square that a row shrinks, a wrong icon slot size, or visible label text fails                                                           | `audit:react-native/IconButton/layout`   |
| FR4          | Unit tests of the `xl` square and glyph                                                                                                 | `xl` alone; `xl` inside a slot that sets a size                                                           | a slot that resolves to `xl`, or an `xl` square or glyph that does not grow with the text, fails                                           | `audit:react-native/IconButton/layout`   |
| FR5, ORD1    | Unit tests of press, link, loading, disabled, tooltip and elevation; the touch-target audit                                             | press; script and accepted `href`; loading and interruptible; disabled with a tooltip; each elevation     | a script `href` that reaches an opener, a press that lands while blocked, a size change while loading, or a target below the floor fails   | `audit:react-native/IconButton/behavior` |
| FR6          | Unit tests of the toggle and its look; VoiceOver and TalkBack checks of the pressed state                                               | pressed and unpressed; each variant; a `ghost` with and without `pressedIcon`; with `href`; a moved touch | a toggle that opens a link, `onPressedChange` before `onClick`, a lost pressed state, or a toggle after travel fails                       | `audit:react-native/IconButton/toggle`   |
| FR7          | Unit tests of the count and its spoken name                                                                                             | `count` zero and non-zero; `countLabel`; `isCountVisible={false}`; a counted toggle                       | a count read apart from the name, a drawn zero, or a counted pill that a row shrinks fails                                                 | `audit:react-native/IconButton/count`    |
| FR8, ORD4    | Unit tests of each surface value and paint through the doubles                                                                          | `plain`, `glass`, unset in a bar and in content; each theme `material`                                    | a glass look without `surface`, the theme or the placement deciding it, or a third surface value, fails                                    | `audit:react-native/IconButton/surface`  |
| FR9, AR3–AR5 | Unit tests of the glass paints with each setting; iOS Simulator and Android emulator captures, light and dark, at the largest text size | each variant; each size; Reduce Transparency; Increase Contrast; Reduce Bright Effects; over a photo      | a circle below the touch target, glass under a contrast setting, an iOS circle that grows with the text, or a lost name in glass fails     | `audit:react-native/IconButton/glass`    |
| AR1, AR2     | VoiceOver and TalkBack checks; unit tests of the spoken name and hint                                                                   | at rest; a count; a tooltip that repeats the name; loading; link                                          | a missing or doubled name, an icon read as content, or a lost busy, disabled or link state fails                                           | `audit:react-native/IconButton/a11y`     |
| PR1          | Unit tests counting renders and mounted views                                                                                           | at rest; glass                                                                                            | added state, listeners, or a second glass view fails                                                                                       | `audit:react-native/IconButton/behavior` |

## Decision log

### DEC-1 — One name; core's props, without the web contract

**Reference:** `component:react-native/IconButton/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

React Native's icon-only action is `IconButton`, the name it has on every
platform, with core's props and meaning, so a builder and an agent write the
same component on the web and on a phone. The web contract's props stay on the
web: an app opens every link through the system, so it has no link target or
relationship; it has no HTML form or element choice; and a press callback that
returns a value, or a value that mixes kinds, has no portable form
(`spec:AST-082` FR3, FR4). Core's `label`, `onClick` and `tooltip` own the
spoken name, the press and the description on React Native too, so each
concept has one input (`spec:AST-082` FR7).

### DEC-2 — An engagement row is an IconButton with a toggle and a count

**Reference:** `component:react-native/IconButton/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

A feed's Like and Save, and a post's reply count, are one press target that
holds a glyph, its on and off state and a number, read as one element ("Like,
12"). On React Native, IconButton carries that state with ToggleButton's names
(`isPressed`, `onPressedChange`, `pressedIcon`) and the count beside the glyph,
so one control keeps the target, the state and the number together. A `ghost`
toggle with a pressed icon draws no fill, so the filled glyph alone carries the
state, as the platforms' own feed rows do.

### DEC-3 — `xl` serves media transport rows

**Reference:** `component:react-native/IconButton/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

A media player's play, pause and skip controls are larger than core's largest
square. `xl` gives a square and a glyph a third larger than `lg`, from the same
theme sizes, and a caller sets it explicitly, so no slot grows a button into a
transport control by accident.

### DEC-4 — A glass IconButton is a circle at the touch target

**Reference:** `component:react-native/IconButton/DEC-4`
**Decider:** imdreamrunner, 2026-11-18

A control floating over content or media is a glass circle the size of the
touch target, as the system's bar and viewer controls are, so the whole circle
is the target and the glass reads as one object. On iOS it keeps one size at
every text size and shows the Large Content Viewer, as the system's glass
buttons do; on Android it grows with the text, as Material's controls do. The
variant keeps its meaning as ink, so a primary action stays tinted and a
destructive one stays red.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
