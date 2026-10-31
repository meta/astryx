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

| Area                    | Contract                                                                                                                                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Button(label:variant:size:elevation:isLoading:isInterruptible:isDisabled:width:tooltip:href:base:onClick:)` and `Button(_ props: ButtonProps)`, a SwiftUI `View` in module `Astryx`.                                                                                                    |
| Behavior                | A SwiftUI `Button` drawn with the Astryx button style, or a SwiftUI `Link` when an enabled Button has `href`. While loading, a spinner covers the label, which keeps its place, and presses wait unless it is interruptible.                                                             |
| End-user impact         | A person gets one action control whose width holds while it loads and which never runs twice by accident; a link Button stays a link while busy, so VoiceOver and keyboard focus stay on it.                                                                                             |
| Builder impact          | An app passes core's Button props; `href` makes the same view open a destination through the system.                                                                                                                                                                                     |
| Compatibility/readiness | Breaking for canary callers: `action:`, `fillsWidth:`, `icon:`, and the hand-written `AstryxButtonVariant` and `AstryxButtonSize` give way to the generated `ButtonProps` (`onClick:`, `width:`, `ButtonVariant`, `ButtonSize`). Draft; built and tested on macOS and the iOS Simulator. |
| Review checks           | Reject a loading link that swaps to a button, a loading Button that runs `onClick` or opens its link while not interruptible, a size change while loading, or a disabled Button with `href` that opens.                                                                                  |
| Governing rules         | `component:Button` FR7–FR11; `spec:AST-082` FR3; `spec:AST-093` FR1–FR5; the Swift component API record (A2–A5) under `packages/native/specs/swift/library/`.                                                                                                                            |

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

**Does not own / non-goals**

- The meaning of Button's props, its variants and sizes, and its pending and
  disabled states — owned by `component:Button`.
- Which destinations a link may open — owned by
  `family:navigation-destinations`.
- How a prop switches to a different SwiftUI control in general — owned by the
  Swift component API record (A2).

## Public concepts

| Concept       | Closed values or states       | Meaning                                                       | Availability by variant/orientation/state | Default  | Owner                    | Stability    | Invalid-value behavior                      |
| ------------- | ----------------------------- | ------------------------------------------------------------- | ----------------------------------------- | -------- | ------------------------ | ------------ | ------------------------------------------- |
| control       | button; link                  | a SwiftUI `Button`, or a SwiftUI `Link` for an enabled `href` | always                                    | button   | `component:swift/Button` | experimental | an `href` that is not a URL leaves a button |
| loading       | idle; loading                 | `isLoading`: spinner over the label, presses wait             | always                                    | idle     | `component:Button`       | experimental | none                                        |
| interruptible | off; on                       | `isInterruptible`: presses and link opens land while loading  | while loading                             | off      | `component:Button`       | experimental | none                                        |
| availability  | operable; busy-only; disabled | disabled wins over loading                                    | always                                    | operable | `component:Button`       | experimental | none                                        |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Basis                                                                            | Draft review state |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------ |
| FR1 | Both initializers MUST build the same `ButtonProps`; base props (`id`, `isHidden`) come through `ButtonProps`.                                                                                                                                                                                                                                                                                                                                                                   | Swift component API A2, A3                                                       | verify             |
| FR2 | While loading, the view MUST draw a spinner over the label, keep the label's place so its size does not change, stay at full opacity, and read as busy ("Loading", core's catalog message) to VoiceOver. It MUST NOT run `onClick` while loading unless it is interruptible; an interruptible loading Button runs `onClick` on each press.                                                                                                                                       | `component:Button` FR7–FR9                                                       | verify             |
| FR3 | An enabled Button with `href` MUST draw a SwiftUI `Link` to that destination, in the Astryx button style, which VoiceOver reads as a link. A disabled Button with `href` MUST draw its disabled button, which never opens.                                                                                                                                                                                                                                                       | `component:Button` FR11; `spec:AST-082` FR3                                      | verify             |
| FR4 | A loading Button with `href` MUST stay a `Link`: it keeps focus, shows its spinner, reads as busy, and does not open its destination until loading ends, unless the Button is interruptible, in which case each activation opens it. It never swaps to a button while busy.                                                                                                                                                                                                      | `component:Button` FR9 ("a link-mode Button stays a link while busy-only"), FR11 | verify             |
| FR5 | A Button whose `href` is a script URL (`javascript:`, `vbscript:`) or an HTML document in a `data:` URL MUST NOT open it, after core's normalization (control characters removed, whitespace trimmed, the scheme compared in lowercase without spaces after its colon): it draws its enabled button, which runs `onClick` and does not look disabled.                                                                                                                            | `component:Button` FR11; `family:navigation-destinations`                        | verify             |
| FR6 | A disabled Button MUST keep its keyboard focus stop and show its tooltip on focus, draw its disabled look, read as a dimmed button to VoiceOver, and never run `onClick`; a focused Button that becomes disabled keeps one view structure and its focus. A Button with `href` keeps its `Link` and its disabled button in one structure, and focus moves from the link to the button when it becomes disabled, and back when it is enabled, so focus stays inside the component. | `component:Button` FR10; `family:buttons` FR3                                    | verify             |

### Allowed variation

- **AV1 — Platform controls.** The control is SwiftUI's `Button` or `Link`, so
  focus rings, press feedback, and how the system opens a destination are the
  platform's own.

### Representative states

| State                     | Required invariant                             | Allowed variation       |
| ------------------------- | ---------------------------------------------- | ----------------------- |
| loading                   | same size as idle; spinner; busy; presses wait | spinner is the system's |
| loading and interruptible | presses land                                   | none                    |
| enabled with `href`       | a `Link`                                       | none                    |
| disabled with `href`      | a dimmed button that never opens               | none                    |
| loading with `href`       | a `Link` that does not open until loading ends | none                    |

### Transformation and precedence order

- **ORD1 — Availability.** Disabled, then loading (busy-only unless
  interruptible), then operable, as in core.

### Performance and resources

- **PR1 — No work while idle.** The view holds no timers or tasks; loading is a
  prop the caller sets.

## Accessibility contract

- **AR1 — Name and state.** The label names the control in every state; a
  loading Button adds core's "Loading" message as its value and announces it
  when loading starts. A link Button reads as a link, a disabled one as dimmed.
- **AR2 — Rendered tree not measured.** Tests assert what the view sets; the
  rendered accessibility tree is not measured until an app-hosted target exists.

## Design relationships

| Anatomy or state | Design requirement              | Representation authority   | Hierarchy role | Component contract |
| ---------------- | ------------------------------- | -------------------------- | -------------- | ------------------ |
| Spinner          | the system's activity indicator | prescribed by the platform | supporting     | FR2, FR4           |

The component implements design requirements without copying their rationale.

Platform control: SwiftUI `Button` and `Link` with `ProgressView`; they are the
platform's own controls and satisfy the contract (`spec:AST-093` FR2). A
`tooltip` shows through the shared Astryx tooltip (`library/tooltip.spec.md`).
Guideline pages: Buttons, Progress indicators, and Accessibility in the Apple
Human Interface Guidelines (`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): `color.accent`, `color.onAccent`,
`color.error`, `color.onError`, `color.neutral`, `color.textPrimary`,
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

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
