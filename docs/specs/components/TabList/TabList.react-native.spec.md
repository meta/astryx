---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/TabList
platform_of: component:TabList
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [
    public-api,
    behavior,
    layout,
    interaction,
    motion,
    scrolling,
    theming,
    accessibility,
    platform,
  ]
verified_by: []
modules: []
families: []
design_specs: []
architecture:
  [architecture:public-component-api, architecture:container-padding]
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# TabList (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `TabList` under core's name with core's `value`, `onChange`, `size`, `layout`, `hasDivider`, `edge` (with the deprecated `isFullBleed` alias), `overflow` and `children` (its `Tab` and `TabMenu` parts), with core's meaning and defaults. React Native adds one `overflow` value, `menu` (DEC-2). Web's `role` and `xstyle` stay in the web contract (DEC-1).              |
| Behavior                | A strip of tabs under a page or card header that switches between related views. An overflowing `hug` strip scrolls sideways and keeps the selected tab in view; a `fill` strip shares its width. An accent indicator slides to the selected tab. With `overflow="menu"`, tabs that do not fit move into a trailing More menu and the selected tab stays in the row.                              |
| End-user impact         | A person swipes along a strip that is wider than the screen, always sees the selected tab, hears each tab's selected state and place, and feels the platform's selection feedback.                                                                                                                                                                                                                |
| Builder impact          | An app writes the same `TabList`, `Tab` and `TabMenu` call site as on the web; the strip reads its look from the theme.                                                                                                                                                                                                                                                                           |
| Compatibility/readiness | Not yet released; additive. Draft. The core and web contracts are unchanged.                                                                                                                                                                                                                                                                                                                      |
| Review checks           | Reject a web-only prop accepted and ignored, a selected tab left out of view, an indicator that moves under Reduce Motion or drawn under a stacked tab, a tab that reads its place only by its position, a `menu` strip that hides the selected tab, a `bleed` strip that clips a tab, its indicator or its divider, a visual value not taken from the theme, or a third-party native dependency. |
| Governing rules         | `component:TabList` FR1–FR6 and AR1–AR2; `component:Tab`; `component:TabMenu`; `architecture:container-padding` INV9–INV11; `spec:AST-082` FR3–FR5; `spec:AST-093` FR2–FR4 and OQ1; `spec:AST-130` FR6; DEC-1–DEC-3 below.                                                                                                                                                                        |

This table is a review projection; the body below is authoritative.

## Intent

On a phone, a strip of tabs is often wider than the screen and always under a
finger. TabList on React Native keeps core's props and parts, so a builder who
knows the web TabList writes the same call site, and it scrolls, selects and
reads the way a phone's tab strips do. This record states only what React
Native adds to `component:TabList` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: controlled through `value` and `onChange`,
  as in core
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Which of core's props React Native offers, and the `menu` overflow value
  (FR1, FR2).
- How the strip scrolls, keeps the selected tab in view and collapses into a
  More menu on React Native (FR3, FR4).
- The indicator's motion, the selection feedback and the strip's accessibility
  on React Native (FR5–FR7).
- How `edge="bleed"` meets a React Native container's padding (FR8).

**Does not own / non-goals**

- The meaning of TabList's props and the `bleed` geometry — owned by
  `component:TabList` and `architecture:container-padding`.
- A tab's look, label, icon and press — owned by `component:Tab`.
- A tab that opens a menu — owned by `component:TabMenu`.
- The app's bottom tab bar — owned by `component:TabBar`.
- The More button and its menu — owned by `component:MoreMenu`.

## Public concepts

| Concept   | Closed values or states             | Meaning                                                                                                           | Availability by variant/orientation/state         | Default                | Owner                                                         | Stability    | Invalid-value behavior           |
| --------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------- | ------------------------------------------------------------- | ------------ | -------------------------------- |
| overflow  | `auto`; `scroll`; `visible`; `menu` | what an overflowing strip does: core's three values, and on React Native a More menu for the tabs that do not fit | every layout; `menu` collapses only a `hug` strip | `auto`                 | `component:TabList`; `menu`: `component:react-native/TabList` | experimental | an unknown value is a type error |
| edge      | `padded`; `bleed`                   | whether the strip keeps its container's padding or meets the container's content edges                            | every layout                                      | `padded`               | `component:TabList`                                           | experimental | an unknown value is a type error |
| indicator | under the selected tab; none        | the accent bar that marks the selected tab                                                                        | none under a stacked tab (icon above label)       | under the selected tab | `component:react-native/TabList`                              | experimental | none                             |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Basis                                                                          | Draft review state |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------ |
| FR1 | React Native's `TabList` MUST take core's `value`, `onChange`, `size`, `layout`, `hasDivider`, `edge`, `isFullBleed` (the deprecated alias of `edge="bleed"`, with an explicit `edge` winning), `overflow` and `children` with core's names, meaning and defaults. `children` holds `Tab` and `TabMenu` parts, React content as a platform contract whose implementation runs React may hold (`spec:AST-082` FR4). Base props are `id` and `isHidden` (`spec:AST-082` FR7) on the strip. It MUST NOT offer web's `role` or `xstyle` (DEC-1). | `component:TabList` FR3, FR4; `spec:AST-082` FR3, FR4, FR7; DEC-1              | verify             |
| FR2 | React Native's `overflow` MUST add `menu` (DEC-2): on a `hug` strip, the tabs that do not fit beside a trailing More button move, from the end, into that button's menu, where choosing one selects it; the selected tab always stays in the row, and a `TabMenu` part never moves. Each tab returns to the row when it fits again. On a `fill` strip the tabs share the width and nothing moves; a development build warns once. `menu` is a value of React Native's contract only (`spec:AST-082` FR5).                                    | DEC-2; `spec:AST-082` FR5                                                      | verify             |
| FR3 | With `overflow="auto"`, a `hug` strip MUST scroll sideways when its tabs do not fit, with no scroll indicator, and a `fill` strip keeps to its width, its tabs sharing it equally and their labels truncating. `scroll` always scrolls, and `visible` lets the tabs spill out of the strip, as core's values say. A scrolling strip shows no arrow controls: under a finger a swipe reaches every tab.                                                                                                                                       | `component:TabList` FR2; `component:TabList` overflow values                   | verify             |
| FR4 | A scrolling strip MUST keep the selected tab in view: a new selection slides it into view, and mounting, a new viewport width or a selected tab past the edge on mount places it there at once. In right-to-left, the strip starts at the right edge and every offset counts from the logical start.                                                                                                                                                                                                                                         | `component:TabList` FR2                                                        | verify             |
| FR5 | An accent indicator, `color.accent` in core's height with fully rounded ends, MUST sit under the selected tab and slide to a new selection on the theme's motion, on the UI thread; under Reduce Motion it moves at once. In right-to-left it runs from the logical start. A selected tab drawn stacked, its icon above its label (a `fill` tab with an icon), shows no indicator, since its own selected look marks it.                                                                                                                     | `component:TabList` FR2; `component:Tab`                                       | verify             |
| FR6 | A new selection by a press or by the More menu MUST call `onChange` once with the new value and play the theme's `select` haptic (`spec:AST-130` FR6); choosing the selected tab again plays nothing.                                                                                                                                                                                                                                                                                                                                        | `component:TabList`; `spec:AST-130` FR6                                        | verify             |
| FR7 | The strip MUST read as a tab list of tabs that each expose their selected state and their place among the tabs ("2 of 3") as words in their value. On Android the strip has the tab list role and each tab the tab role. On iOS each tab is a button with its selected state and the strip carries no trait, because UIKit's tab-bar trait treats a strip's tabs unevenly (DEC-3). The strip has no navigation landmark: React Native has none.                                                                                              | `component:TabList` AR1; `component:Tab`; DEC-3                                | verify             |
| FR8 | `edge="bleed"` MUST apply core's `bleed` geometry to the React Native stack around the strip: the strip cancels the stack's inline padding, a `hasDivider` rail spans that wider box, and the row pads back by the part of the padding the edge tabs' own padding does not supply, so the edge labels stay on the content line. It never clips a tab, the indicator, the divider or the More button.                                                                                                                                         | `component:TabList` FR1, FR2, AR2; `architecture:container-padding` INV9–INV11 | verify             |
| FR9 | The strip MUST keep its tabs' height, never growing in a parent that stretches it, and `hasDivider` draws a hairline in the theme's border colour under the whole strip.                                                                                                                                                                                                                                                                                                                                                                     | `component:TabList`                                                            | verify             |

### Allowed variation

- **AV1 — Scroll physics.** How the strip decelerates and bounces is the
  platform's own.
- **AV2 — The platform's feedback.** The `select` haptic plays as each platform
  plays its selection feedback, or not at all where the device has none.

### Representative states

| State                               | Required invariant                                                                | Allowed variation       |
| ----------------------------------- | --------------------------------------------------------------------------------- | ----------------------- |
| `hug` strip wider than the screen   | scrolls sideways; the selected tab in view                                        | scroll physics          |
| selected tab past the edge on mount | placed in view at once, without a slide                                           | none                    |
| new selection                       | `onChange` once; the indicator slides; the `select` haptic                        | the platform's feedback |
| Reduce Motion                       | the indicator moves at once                                                       | none                    |
| `fill` strip of icon tabs           | tabs share the width; no indicator under the stacked selected tab                 | none                    |
| `overflow="menu"`, narrow screen    | the tail moves into More; the selected tab stays in the row                       | the menu's look         |
| right to left                       | the strip starts at the right; the indicator runs from the logical start          | none                    |
| `edge="bleed"` in a padded stack    | meets the stack's content edges; edge labels on the content line; nothing clipped | none                    |

### Transformation and precedence order

- **ORD1 — Overflow.** `menu` collapses a `hug` strip; `auto` scrolls a `hug`
  strip and keeps a `fill` strip to its width; `scroll` scrolls; `visible`
  spills.
- **ORD2 — Edge.** An explicit `edge`, then `isFullBleed`, then `padded`
  (`component:TabList` FR4).
- **ORD3 — Collapse.** The selected tab and every `TabMenu` part stay in the
  row; other tabs move into More from the end until the row fits.

### Performance and resources

- **PR1 — No JavaScript per frame.** The indicator's slide runs on the UI
  thread.
- **PR2 — Measure on change.** The strip measures its tabs when their layout
  changes and the More menu re-collapses only when a width changes.

## Accessibility contract

- **AR1 — Tabs read as tabs.** Each tab exposes its selected state and its place
  among the tabs as words (FR7); the More button is `MoreMenu`'s trigger and keeps its name.
- **AR2 — Reachable tabs.** A swipe reaches every tab of a scrolling strip, and
  a screen reader reaches every tab, the ones in the More menu through it.
- **AR3 — Reduced motion.** Under Reduce Motion the indicator and the scroll to
  the selected tab move at once.
- **AR4 — Text size.** Tab labels scale with Dynamic Type and Android's font
  scale; the strip grows to their height.

## Design relationships

| Anatomy or state | Design requirement                                          | Representation authority | Hierarchy role     | Component contract |
| ---------------- | ----------------------------------------------------------- | ------------------------ | ------------------ | ------------------ |
| Strip            | a row of tabs that scrolls when it overflows                | theme intent             | primary navigation | FR3, FR4           |
| Indicator        | an accent bar under the selected tab                        | theme intent             | supporting         | FR5                |
| More button      | a trailing button whose menu holds the tabs that do not fit | theme intent             | supporting         | FR2                |
| Divider          | a hairline under the strip                                  | theme intent             | supporting         | FR9                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): none. UIKit has no tab strip:
UITabBar is the app's bottom tab bar, which `component:TabBar` owns, and
UISegmentedControl is a segmented picker, which cannot hold a `TabMenu` part
or scroll an overflowing strip. Material 3's tab row on Android cannot hold a
`TabMenu` part either. The strip is React Native's `ScrollView` and views drawn
from the theme. Guideline pages: Tab bars, Segmented controls and
Accessibility (Dynamic Type, Reduce Motion, VoiceOver) in the Apple Human
Interface Guidelines (`spec:AST-093` FR3); on Android the strip follows
Material 3's Tabs page, and Android guidelines are `spec:AST-093` OQ1, which is
open.

Theme values read (`spec:AST-093` FR4): `color.accent` for the indicator, the
border colour and width for the divider, `space.s0_5` between tabs, the motion
duration and easing, and the text size scale; the tabs' own values are
`component:Tab`'s.

### Native pieces

| Native piece    | Record             | What this record uses it for                 |
| --------------- | ------------------ | -------------------------------------------- |
| `AstryxHaptics` | `spec:AST-130` FR6 | the `select` haptic on a new selection (FR6) |

## Family and system relationships

- `component:TabList` owns the props and the `bleed` geometry; this record
  states how React Native draws them.
- `component:Tab` and `component:TabMenu` own the parts the strip holds.
- `component:TabBar` owns the app's bottom tab bar.
- `architecture:container-padding` owns the edge vocabulary.

## Verification map

| Contract       | Verification                                                                 | Representative states                                                                               | Mutation or failure expectation                                                                                   | Audit section                          |
| -------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| FR1            | Type tests against core's TabList contract and each platform's types         | each core prop; `edge` and `isFullBleed` together; `role`; `xstyle`                                 | a web-only prop that type-checks, or `isFullBleed` winning over an explicit `edge`, fails                         | `audit:react-native/TabList/api`       |
| FR2, ORD3      | Unit tests of the collapse                                                   | narrow and wide strips; the selected tab at the end; a `TabMenu` part; a `fill` strip               | the selected tab in More, a `TabMenu` part in More, a tab left out of both, or no warning on a `fill` strip fails | `audit:react-native/TabList/menu`      |
| FR3, FR4, ORD1 | Unit tests of overflow and scroll placement, left to right and right to left | each `overflow`; `hug` and `fill`; a selected tab past the edge on mount; a resize; a new selection | a selected tab out of view, a slide on mount, or a `fill` strip that scrolls fails                                | `audit:react-native/TabList/overflow`  |
| FR5, AR3, PR1  | Unit tests of the indicator; UI-thread frame checks                          | a new selection; Reduce Motion; right to left; a stacked selected tab                               | a slide under Reduce Motion, JavaScript per frame, or an indicator under a stacked tab fails                      | `audit:react-native/TabList/indicator` |
| FR6            | Unit tests through the testing doubles                                       | a press; a More menu choice; the selected tab again                                                 | a second `onChange`, a missing haptic, or a haptic for the same tab fails                                         | `audit:react-native/TabList/select`    |
| FR7, AR1, AR2  | VoiceOver and TalkBack checks; unit tests of the accessibility props         | three tabs; a selected tab; a More menu                                                             | a tab without its selected state or place, or a tab no screen reader reaches, fails                               | `audit:react-native/TabList/a11y`      |
| FR8, FR9       | Unit tests of the bleed and the strip's height                               | a padded stack; `hasDivider`; a stretching parent                                                   | a clipped tab, indicator, divider or More button, an edge label off the content line, or a taller strip fails     | `audit:react-native/TabList/layout`    |

## Decision log

### DEC-1 — React Native keeps core's TabList; web-only props stay on the web

**Reference:** `component:react-native/TabList/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

React Native's TabList takes core's props and parts with core's names and
meaning, so a call site reads the same on the web and on a phone. The web
contract keeps `role`, which picks between a navigation landmark and the tabs
pattern in the DOM while React Native has no landmark and always reads the
strip as tabs (FR7), and `xstyle`, a web styling input.

### DEC-2 — `overflow="menu"` collapses the strip into a More menu

**Reference:** `component:react-native/TabList/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

On a phone, a scrolled strip hides the tabs past the edge until a person swipes
to them. With `overflow="menu"`, the tabs that do not fit move into a trailing
More menu, so every tab is one tap away and the selected tab stays visible in
the row, as the platforms' own tab bars keep a More place. It is a value of
React Native's contract, because the web strip's hover arrows already reach
its hidden tabs.

### DEC-3 — On iOS a tab is a button with its selected state

**Reference:** `component:react-native/TabList/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

UIKit's tab-bar trait does not treat a strip's tabs alike: in one strip the
selected tab reads as one kind of element and the others as another. On iOS
every tab is therefore a button with its selected state, the strip carries no
trait, and each tab says its place among the tabs in its value, so every tab
reads the same way.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
