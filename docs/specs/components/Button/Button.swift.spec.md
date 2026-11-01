---
schema_version: 3
template_version: 7
kind: component
id: component:swift/Button
platform_of: component:Button
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by: [packages/native/apple/Tests/AstryxTests/ButtonTests.swift]
modules: []
families: [family:buttons, family:navigation-destinations]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# Button (Swift) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Button(label:variant:size:elevation:isLoading:isInterruptible:isDisabled:width:tooltip:href:base:onClick:)` and `Button(_ props: ButtonProps)`, a SwiftUI `View` in module `Astryx`.                                                                                                                                                                                                                                                                                        |
| Behavior                | A SwiftUI `Button` drawn with the Astryx button style, or a SwiftUI `Link` when an enabled Button has `href`. While loading, a spinner covers the label, which keeps its place, and presses wait unless it is interruptible. On iOS and iPadOS 26 and later, in a system bar or under the floating-glass opt-in, it draws the system's Liquid Glass in place of its own fill: an unset `variant` is `secondary`, as in core, and every `variant` keeps its meaning in glass. |
| End-user impact         | A person gets one action control whose width holds while it loads and which never runs twice by accident; a link Button stays a link while busy, so VoiceOver and keyboard focus stay on it. In bars and floating controls it looks and behaves like the system's buttons beside it, one layer of glass rather than a fill inside glass, and a main or destructive action still reads as one.                                                                                |
| Builder impact          | An app passes core's Button props; `href` makes the same view open a destination through the system. A Button in a bar needs no extra code; one Apple-only modifier on a floating container opts its Buttons into glass. A `variant` the callsite sets is always obeyed.                                                                                                                                                                                                     |
| Compatibility/readiness | Breaking for canary callers: `action:`, `fillsWidth:`, `icon:`, and the hand-written `AstryxButtonVariant` and `AstryxButtonSize` give way to the generated `ButtonProps` (`onClick:`, `width:`, `ButtonVariant`, `ButtonSize`). Draft; built and tested on macOS and the iOS Simulator.                                                                                                                                                                                     |
| Review checks           | Reject a loading link that swaps to a button, a loading Button that runs `onClick` or opens its link while not interruptible, a size change while loading, or a disabled Button with `href` that opens. Reject an Astryx fill drawn inside a bar's glass, a set `variant` that glass overrides or drops, glass drawn under Reduce Transparency or Increase Contrast, or a glass change merged without the simulator capture gate.                                            |
| Governing rules         | `component:Button` FR7–FR11; `spec:AST-082` FR3; `spec:AST-093` FR1–FR5; the Swift component API record (A2–A5) under `packages/native/specs/swift/library/`; DEC-1 below.                                                                                                                                                                                                                                                                                                   |

This table is a review projection; the body below is authoritative.

## Intent

Button on Apple platforms is core's action control drawn with SwiftUI's own
button and link, so presses, focus, and VoiceOver work the platform's way while
its look, loading, and link behavior follow the core `Button` contract.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: breaking for canary callers (hand-written parameters → generated `ButtonProps`)
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- How Swift draws core's Button: the SwiftUI control it uses, the loading
  presentation, when presses land, and when `href` makes it a link.
- How Button meets the system's Liquid Glass on Apple platforms: in system bars,
  under the floating-glass opt-in, and under Reduce Transparency or Increase
  Contrast (FR7–FR11).

**Does not own / non-goals**

- The meaning of Button's props, its variants and sizes, and its pending and
  disabled states — owned by `component:Button`.
- Which destinations a link may open — owned by
  `family:navigation-destinations`.
- How a prop switches to a different SwiftUI control in general — owned by the
  Swift component API record (A2).
- The glass itself, how a bar groups its items, and the scroll edge effect —
  owned by the system.
- Search in a navigation context — not a Button concern.

## Public concepts

| Concept       | Closed values or states                 | Meaning                                                              | Availability by variant/orientation/state        | Default  | Owner                    | Stability    | Invalid-value behavior                      |
| ------------- | --------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------ | -------- | ------------------------ | ------------ | ------------------------------------------- |
| control       | button; link                            | a SwiftUI `Button`, or a SwiftUI `Link` for an enabled `href`        | always                                           | button   | `component:swift/Button` | experimental | an `href` that is not a URL leaves a button |
| loading       | idle; loading                           | `isLoading`: spinner over the label, presses wait                    | always                                           | idle     | `component:Button`       | experimental | none                                        |
| interruptible | off; on                                 | `isInterruptible`: presses and link opens land while loading         | while loading                                    | off      | `component:Button`       | experimental | none                                        |
| availability  | operable; busy-only; disabled           | disabled wins over loading                                           | always                                           | operable | `component:Button`       | experimental | none                                        |
| surface       | token; bar glass; floating glass; solid | where the Button sits decides what draws behind its label (FR7–FR10) | iOS and iPadOS 26 and later for the glass values | token    | `component:swift/Button` | experimental | none                                        |

## Behavioral and layout contract

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                                                                            | Draft review state |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------ |
| FR1  | Both initializers MUST build the same `ButtonProps`; base props (`id`, `isHidden`) come through `ButtonProps`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Swift component API A2, A3                                                       | verify             |
| FR2  | While loading, the view MUST draw a spinner over the label, keep the label's place so its size does not change, stay at full opacity, and read as busy ("Loading", core's catalog message) to VoiceOver. It MUST NOT run `onClick` while loading unless it is interruptible; an interruptible loading Button runs `onClick` on each press.                                                                                                                                                                                                                                                                                                                                                                        | `component:Button` FR7–FR9                                                       | verify             |
| FR3  | An enabled Button with `href` MUST draw a SwiftUI `Link` to that destination, in the Astryx button style, which VoiceOver reads as a link. A disabled Button with `href` MUST draw its disabled button, which never opens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `component:Button` FR11; `spec:AST-082` FR3                                      | verify             |
| FR4  | A loading Button with `href` MUST stay a `Link`: it keeps focus, shows its spinner, reads as busy, and does not open its destination until loading ends, unless the Button is interruptible, in which case each activation opens it. It never swaps to a button while busy.                                                                                                                                                                                                                                                                                                                                                                                                                                       | `component:Button` FR9 ("a link-mode Button stays a link while busy-only"), FR11 | verify             |
| FR5  | A Button whose `href` is a script URL (`javascript:`, `vbscript:`) or an HTML document in a `data:` URL MUST NOT open it, after core's normalization (control characters removed, whitespace trimmed, the scheme compared in lowercase without spaces after its colon): it draws its enabled button, which runs `onClick` and does not look disabled.                                                                                                                                                                                                                                                                                                                                                             | `component:Button` FR11; `family:navigation-destinations`                        | verify             |
| FR6  | A disabled Button MUST keep its keyboard focus stop and show its tooltip on focus, draw its disabled look, read as a dimmed button to VoiceOver, and never run `onClick`; a focused Button that becomes disabled keeps one view structure and its focus. A Button with `href` keeps its `Link` and its disabled button in one structure, and focus moves from the link to the button when it becomes disabled, and back when it is enabled, so focus stays inside the component.                                                                                                                                                                                                                                  | `component:Button` FR10; `family:buttons` FR3                                    | verify             |
| FR7  | On iOS and iPadOS 26 and later, a Button hosted in a system bar (navigation bar or toolbar) MUST draw no fill, border, or shadow of its own, so the bar's glass is its only chrome; its label and any tint follow FR8. An unset `variant` is `secondary`, as in core, so it draws `secondary`'s bar treatment: label only, in `color.textPrimary`, on the bar's glass. This needs no new prop or modifier.                                                                                                                                                                                                                                                                                                        | DEC-1; Apple's Liquid Glass guidance (remove custom backgrounds in bars)         | verify             |
| FR8  | A `variant` the callsite sets MUST always be obeyed. On iOS and iPadOS 26 and later, in a system bar and under the floating opt-in (FR9), it maps to the closest glass treatment that keeps its meaning, and is never replaced by the unset treatment or by another variant: `primary` → prominent glass tinted `color.accent`, label `color.onAccent`; `destructive` → prominent glass tinted `color.error`, label `color.onError`; `secondary` → regular glass (in a bar, the bar's own glass), label `color.textPrimary`, no `color.neutral` fill; `ghost` → floating: clear glass, label `color.textPrimary`; in a bar: the bar's own glass, label `color.textPrimary` (the bar owns its items' backgrounds). | DEC-1                                                                            | verify             |
| FR9  | On iOS and iPadOS 26 and later, one Apple-only modifier MUST only mark a container as floating (controls over scrolling content); the Buttons inside it draw FR8's floating treatment, subject to the theme's `material` (ORD2) and FR10, with an unset `variant` drawn as `secondary`. Without the modifier, a Button outside a system bar keeps its token look. The modifier is not a prop and changes no `ButtonProps` (Swift component API A2).                                                                                                                                                                                                                                                               | DEC-1                                                                            | verify             |
| FR10 | Under Reduce Transparency or Increase Contrast, a Button that would draw glass (FR7–FR9) MUST draw no glass: its variant's token fill (`color.accent` for `primary`, `color.error` for `destructive`, `color.neutral` for `secondary` and an unset `variant`, `color.backgroundSurface` for `ghost`) with a `color.borderEmphasized` edge, so its label keeps a solid, visible background. Before iOS 26, and on platforms FR7–FR9 do not cover (macOS, OQ2), the token look stays.                                                                                                                                                                                                                               | DEC-1; `spec:AST-093` FR2                                                        | verify             |
| FR11 | In glass, the other props keep their meaning: `isLoading`, `isInterruptible`, `isDisabled`, `href`, and `tooltip` behave as FR2–FR6; `size` sets the label's type size and, floating, the control's height, while a bar sets its items' height; `width: fill` applies when floating, while a bar sizes its items; `elevation` is not drawn on glass, which carries its own depth. A Button's label MUST NOT be truncated by Astryx padding inside a bar that has room for it.                                                                                                                                                                                                                                     | `component:Button` FR7–FR11; DEC-1                                               | verify             |

### Variant mapping in glass

FR7–FR9 in one table. "Least surprising" means a callsite gets what its
`variant` already promises, with the system's glass as its surface.

| `variant`     | In a system bar (iOS and iPadOS 26)                                              | Floating, opted in (iOS and iPadOS 26)                    | Least surprising because                                                                                              |
| ------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| not set       | as `secondary`: the bar's glass, label `color.textPrimary`, no fill              | regular glass, label `color.textPrimary` (as `secondary`) | core's default is `secondary`, so an unset Button is a secondary one on every platform                                |
| `primary`     | prominent glass tinted `color.accent`, label `color.onAccent`                    | the same                                                  | still the one filled, accent-colored main action, as the system's prominent bar buttons are                           |
| `secondary`   | the bar's glass, label `color.textPrimary`, no `color.neutral` fill              | regular glass, label `color.textPrimary`                  | still a neutral action; the glass takes the place of the neutral fill, so there is one surface, not two               |
| `ghost`       | the bar's glass, label `color.textPrimary` (the bar owns its items' backgrounds) | clear glass, label `color.textPrimary`                    | still the quietest action; clear glass is the least visible surface that keeps the label readable over moving content |
| `destructive` | prominent glass tinted `color.error`, label `color.onError`                      | the same                                                  | still reads as destructive before it is pressed                                                                       |

### Allowed variation

- **AV1 — Platform controls.** The control is SwiftUI's `Button` or `Link`, so
  focus rings, press feedback, and how the system opens a destination are the
  platform's own.
- **AV2 — The system's glass.** In glass (FR7–FR9), refraction, how a bar groups
  and morphs its items, press effects, and the scroll edge effect are the
  system's own and may change with each iOS release.

### Representative states

| State                                    | Required invariant                             | Allowed variation               |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------- |
| loading                                  | same size as idle; spinner; busy; presses wait | spinner is the system's         |
| loading and interruptible                | presses land                                   | none                            |
| enabled with `href`                      | a `Link`                                       | none                            |
| disabled with `href`                     | a dimmed button that never opens               | none                            |
| loading with `href`                      | a `Link` that does not open until loading ends | none                            |
| in a bar, `variant` unset                | `secondary`'s bar treatment; no Astryx fill    | the system's glass and grouping |
| in a bar, `variant` set                  | FR8's treatment for that variant               | the system's glass and grouping |
| floating, opted in                       | FR8's treatment; unset takes `secondary`'s     | the system's glass              |
| Reduce Transparency or Increase Contrast | solid token fill with an edge, no glass        | none                            |

### Transformation and precedence order

- **ORD1 — Availability.** Disabled, then loading (busy-only unless
  interruptible), then operable, as in core.
- **ORD2 — Surface.** Reduce Transparency or Increase Contrast (solid, FR10);
  then the theme's `material` (`spec:AST-082` FR10): `opaque` draws FR10's
  solid surface wherever floating glass (FR9) would draw, while a Button in a
  bar still draws no fill of its own, and `translucent` or an absent `material`
  keeps FR7–FR9; then the `variant`'s treatment (FR8, an unset `variant` as
  `secondary`); then the token look outside bars and floating containers.
  Placement never overrides a set `variant`.

### Performance and resources

- **PR1 — No work while idle.** The view holds no timers or tasks; loading is a
  prop the caller sets.

## Accessibility contract

- **AR1 — Name and state.** The label names the control in every state; a
  loading Button adds core's "Loading" message as its value and announces it
  when loading starts. A link Button reads as a link, a disabled one as dimmed.
- **AR3 — Glass keeps the name and role.** In glass the Button keeps its label,
  its button or link role, and its loading and disabled states (AR1); the system
  draws only what is behind the label.
- **AR2 — Rendered tree not measured.** Tests assert what the view sets; the
  rendered accessibility tree is not measured until an app-hosted target exists.

## Design relationships

| Anatomy or state | Design requirement                                    | Representation authority   | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Spinner          | the system's activity indicator                       | prescribed by the platform | supporting     | FR2, FR4           |
| Glass surface    | the system's Liquid Glass (regular, clear, prominent) | prescribed by the platform | supporting     | FR7–FR10           |

The component implements design requirements without copying their rationale.

Platform control: SwiftUI `Button` and `Link` with `ProgressView`; they are the
platform's own controls and satisfy the contract (`spec:AST-093` FR2). A
`tooltip` shows through the shared Astryx tooltip (`library/tooltip.spec.md`).
Guideline pages: Buttons, Progress indicators, and Accessibility in the Apple
Human Interface Guidelines (`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): `color.accent`, `color.onAccent`,
`color.error`, `color.onError`, `color.neutral`, `color.textPrimary`,
`color.backgroundSurface` and `color.borderEmphasized` (the solid fallback),
`size.elementSm`, `size.elementMd`, `size.elementLg`, `radius.element`,
`space` steps for padding, `font.label` and `font.family.body`, the
`shadow.low`, `shadow.med`, and `shadow.high` layers, and the Dynamic Type
scale.

## Family and system relationships

- `component:Button` owns the props, the pending and disabled states, and link
  mode; this record states only how Swift draws them.
- `family:navigation-destinations` owns destination handling for links.

## Verification map

| Contract | Verification                                                                                                                                                                                                        | Representative states                                                                                                                                  | Mutation or failure expectation                                                                                       | Audit section                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| FR1      | `ButtonTests.swift` initializer test                                                                                                                                                                                | both initializers                                                                                                                                      | differing props fail                                                                                                  | `audit:swift/Button/api`      |
| FR2      | `ButtonTests.swift` loading, width, and interruptible tests                                                                                                                                                         | loading; loading and interruptible                                                                                                                     | a press that lands while loading, a size change, or dimming fails                                                     | `audit:swift/Button/loading`  |
| FR3      | `ButtonTests.swift` `href` test                                                                                                                                                                                     | enabled and disabled with `href`                                                                                                                       | a disabled Button that opens, or an enabled one that is not a link, fails                                             | `audit:swift/Button/link`     |
| FR4      | `ButtonTests.swift` `href` test with loading, and with loading and interruptible                                                                                                                                    | loading with `href`; interruptible                                                                                                                     | a busy link that swaps to a button or opens before loading ends fails                                                 | `audit:swift/Button/link`     |
| FR5      | `ButtonTests.swift` refused-destination and normalization tests                                                                                                                                                     | `javascript:`, `vbscript:`, `data:text/html`, padded, mixed case, with controls, and `data: text/html`; a `data:image` and a `mailto:` that still open | a refused destination that opens, an unnormalized one that slips through, or a refused one that looks disabled, fails | `audit:swift/Button/link`     |
| FR6      | `ButtonTests.swift` disabled tests, including a disabled Button with `href` keeping its destination for one structure; the focus stop and the focus move are not measured until an app-hosted test can observe them | disabled with and without a tooltip; disabled with `href`                                                                                              | a disabled Button that runs `onClick` or opens its link, or one marked without its focus stop, fails                  | `audit:swift/Button/disabled` |
| AR1      | `ButtonTests.swift` accessibility assertions                                                                                                                                                                        | idle; loading; link                                                                                                                                    | a missing name, value, or announcement fails                                                                          | `audit:swift/Button/a11y`     |
| FR7      | Simulator capture gate: an unset Button in the navigation bar and in the bottom toolbar, light and dark, on each new iOS; a unit test that an unset bar Button draws no fill                                        | navigation bar; bottom toolbar                                                                                                                         | an Astryx fill inside the bar's glass fails                                                                           | `audit:swift/Button/glass`    |
| FR8      | Simulator capture gate: each variant in a bar and floating, light and dark; a unit test of the variant-to-treatment mapping                                                                                         | primary; secondary; ghost; destructive                                                                                                                 | a set variant drawn as another, or as the unset treatment, fails                                                      | `audit:swift/Button/glass`    |
| FR9      | Simulator capture gate: floating Buttons with and without the modifier; a unit test that the modifier changes no `ButtonProps`                                                                                      | opted in; not opted in                                                                                                                                 | glass without the modifier, or a token fill with it, fails                                                            | `audit:swift/Button/glass`    |
| FR10     | Simulator capture gate with Reduce Transparency and with Increase Contrast on                                                                                                                                       | each variant in a bar and floating                                                                                                                     | any glass drawn, or a label without a solid background, fails                                                         | `audit:swift/Button/glass`    |
| FR11     | `ButtonTests.swift` loading and disabled tests in glass; simulator capture gate for label truncation in a bar                                                                                                       | loading; disabled; long label                                                                                                                          | a truncated label with room, or a lost loading or disabled state, fails                                               | `audit:swift/Button/glass`    |

## Decision log

### DEC-1 — Button meets the system's glass, and a set variant is always obeyed

**Reference:** `component:swift/Button/DEC-1`
**Decider:** cixzhang, 2026-10-31

On iOS and iPadOS 26 and later, a Button in a system bar draws no fill of its
own, so the bar's glass is its only chrome; a Button in a container the
Apple-only modifier marks as floating draws SwiftUI's glass; and Reduce
Transparency or Increase Contrast draws a solid token surface. A `variant` the
callsite sets keeps its meaning in glass (FR8): `primary` and `destructive`
stay the one filled, colored action, and `secondary` and `ghost` stay neutral.
An unset `variant` is `secondary`, as core defines it, so an unset bar Button
has a neutral label where a native bar item takes the tint.

Rejected: no Astryx glass, with apps using SwiftUI's own buttons in bars and
floating controls.

## Open questions

- **OQ1 — Bottom-toolbar detection.** (`gap`) SwiftUI has no public signal that
  a view sits in a system bar. FR7 is not verified for the bottom toolbar until
  a detection passes the capture gate there.
- **OQ2 — macOS.** (`human-api`) macOS 26 toolbars and floating controls also
  use Liquid Glass; whether FR7–FR10 apply on macOS is not decided.
- **OQ3 — The opt-in's name.** (`human-api`) FR9's modifier is named when it is
  built and reviewed with the public Swift API.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
