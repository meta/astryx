---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Card
platform_of: component:Card
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
families: []
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:container-padding,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# Card (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `Card` under core's name with core's `children`, `padding`, `variant` and `elevation`, with core's meaning and defaults. Core's `width`, `height`, `maxWidth` and `minHeight` stay in the web contract (DEC-1).                                                                 |
| Behavior                | A rounded surface from the theme that holds one discrete item: it paints its variant, draws `default`'s border inside its padding, casts its elevation's shadow, publishes its padding to what it holds, clips what does not fit, and turns bare words into body text.                               |
| End-user impact         | A person sees grouped content on the same surface as on the web, with insets on the spacing scale; a screen reader reads what the card holds, not the card.                                                                                                                                          |
| Builder impact          | An app writes the same `Card` call site as on the web; its size comes from the layout around it.                                                                                                                                                                                                     |
| Compatibility/readiness | Not yet released; additive. Draft. The core and web contracts are unchanged.                                                                                                                                                                                                                         |
| Review checks           | Reject a card that becomes an accessibility element, a variant that falls through to another variant, a variant core does not have, a lost padding publication, bare words that fail to render, a sizing prop accepted and ignored, a visual value not taken from the theme, or a native dependency. |
| Governing rules         | `component:Card` FR2, FR3, FR5 and AR1; `architecture:container-padding` INV11; `architecture:component-theming-surface`; `spec:AST-082` FR3, FR4, FR7, FR10 and DEC-2; `spec:AST-093` FR2, FR4 and FR5; DEC-1 below.                                                                                |

This table is a review projection; the body below is authoritative.

## Intent

A card groups one discrete item, a profile, a metric or a product, on a surface
of its own. Card on React Native keeps core's props and surface, so a screen
reads the same on the web and on a phone, and it draws that surface from the
theme with React Native's own views. This record states only what React Native
adds to `component:Card` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: not applicable; Card holds no value
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR2 gap: the package's Card also takes the `variant` values `body` and
  `surface`, the theme's page and surface backgrounds.

## Ownership boundary

**Owns**

- Which of core's props React Native offers (FR1).
- How a React Native card holds its content: bare words, clipping and its
  place in a row (FR4, FR5).
- How the card reads to screen readers on React Native (FR6).

**Does not own / non-goals**

- The meaning of Card's props, its variants, its padding resolution and its
  published inset — owned by `component:Card` and
  `architecture:container-padding`.
- A card that acts as one control — owned by `component:ClickableCard` and
  `component:SelectableCard`.
- A page region — owned by `component:Section`.
- A card's size in a row — owned by the stack around it.

## Public concepts

| Concept | Closed values or states | Meaning | Availability by variant/orientation/state | Default | Owner | Stability | Invalid-value behavior |
| ------- | ----------------------- | ------- | ----------------------------------------- | ------- | ----- | --------- | ---------------------- |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Basis                                                                                | Draft review state |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------ |
| FR1 | React Native's `Card` MUST take core's `children`, `padding`, `variant` and `elevation` with core's names, meaning and defaults. `children` takes React content, as a platform contract whose implementation runs React may (`spec:AST-082` FR4). Base props are `id` and `isHidden` (`spec:AST-082` FR7) on the card's container, the part core's target sits on. It MUST NOT offer core's `width`, `height`, `maxWidth` or `minHeight` (DEC-1).                                        | `component:Card` FR2, FR3, FR5; `spec:AST-082` FR3, FR4, FR7; DEC-1                  | verify             |
| FR2 | `variant` MUST paint as `component:Card` FR2 states: `default` the card background with the theme's border, `transparent` nothing, `muted` the muted background, and each palette value its own background tint, with the corners of the theme's container radius. A theme's own variant name paints the base surface, never another variant. React Native offers no variant core does not have (`spec:AST-082` DEC-2).                                                                  | `component:Card` FR2; `spec:AST-082` DEC-2; `architecture:component-theming-surface` | verify             |
| FR3 | `padding` MUST resolve and publish as `component:Card` FR3 states: an omitted `padding` takes spacing step 4, or the padding a platform entry's `components` override for Card sets (`spec:AST-082` FR10); a step applies to every edge; a bordered card reduces each edge by the theme's border width, never below zero; and the card publishes its inset to what it holds, so a `Layout` or a full-bleed `Divider` inside it meets its edges (`architecture:container-padding` INV11). | `component:Card` FR3; `spec:AST-082` FR10; `architecture:container-padding` INV11    | verify             |
| FR4 | The card MUST have no minimum width, so it shrinks in a row instead of holding the row at its content's width, and MUST clip what does not fit; it never scrolls. Its size comes from the layout around it: a `Stack`, a `StackItem` or the parent view (DEC-1).                                                                                                                                                                                                                         | `component:Card` FR4; DEC-1                                                          | verify             |
| FR5 | Bare words in `children` MUST render as body text in the theme's body type and text colour, since React Native draws words only inside a text view. Other content renders as given.                                                                                                                                                                                                                                                                                                      | proposal; `spec:AST-082` FR4                                                         | verify             |
| FR6 | The card MUST NOT be an accessibility element: it has no role, name or focus stop of its own, and VoiceOver and TalkBack reach the things it holds one by one (`component:Card` AR1). It announces nothing.                                                                                                                                                                                                                                                                              | `component:Card` AR1                                                                 | verify             |
| FR7 | `elevation` MUST cast no shadow for `none` and the theme's low, medium or high shadow for the other values (`component:Card` FR5). A platform entry's `components` override for Card (`spec:AST-082` FR10) applies over the card's own styles.                                                                                                                                                                                                                                           | `component:Card` FR5; `spec:AST-082` FR10                                            | verify             |

### Allowed variation

- **AV1 — Theme paint.** A theme may change the card's fills, border, corners,
  shadows and padding through its tokens and a platform entry's `components`
  override for Card (`spec:AST-082` FR10), without changing the card's
  structure or semantics.

### Representative states

| State                      | Required invariant                                       | Allowed variation |
| -------------------------- | -------------------------------------------------------- | ----------------- |
| `default`, padding omitted | card background, border inside spacing step 4            | theme paint       |
| `padding={0}`              | content meets the card's edges                           | none              |
| a theme variant            | the base surface                                         | theme paint       |
| in a narrow row            | shrinks below its content width; clips                   | none              |
| bare words                 | body text                                                | none              |
| with a screen reader       | the card's content, one thing at a time; no card element | none              |

### Transformation and precedence order

- **ORD1 — Padding.** `padding`, then a platform entry's `components`
  override for Card, then step 4 (`component:Card` FR3).
- **ORD2 — Styles.** The card's own styles, then a platform entry's
  `components` override for Card.

### Performance and resources

- **PR1 — No work of its own.** The card holds no timers or listeners; it
  computes its frame only when its variant, elevation, padding or theme
  changes.

## Accessibility contract

- **AR1 — No semantics added.** The card adds no role, name or focus stop; its
  content's semantics pass through (FR6).
- **AR2 — Text size.** Bare words render as body text, which scales with
  Dynamic Type and Android's font scale, and the card grows with its content.

## Design relationships

| Anatomy or state | Design requirement                                           | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------ | ------------------------ | -------------- | ------------------ |
| Surface          | the variant's fill, the container radius, `default`'s border | theme intent             | container      | FR2                |
| Shadow           | the elevation's shadow                                       | theme intent             | supporting     | FR7                |
| Padding          | the spacing step, or a platform entry's override for Card    | theme intent             | container      | FR3                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): none. React Native has no card view,
and SwiftUI's grouped backgrounds and Android's card views are native views
React Native does not draw, so the card is a React Native `View` drawn from
the theme.

Theme values read (`spec:AST-093` FR4): `color.backgroundCard`,
`color.backgroundMuted`, the palette background colours, the border colour and
width, `radius.container`, the `space` steps, the `shadow.low`, `shadow.med`
and `shadow.high` layers, the body type and text colour, and a platform
entry's `components` override for Card (`spec:AST-082` FR10).

## Family and system relationships

- `component:Card` owns the props, the variants, the padding resolution and the
  published inset; this record states how React Native draws them.
- `component:ClickableCard` and `component:SelectableCard` draw the same
  surface for a card that acts.
- `architecture:container-padding` owns the padding a card publishes.

## Verification map

| Contract       | Verification                                                                                                         | Representative states                                                                                        | Mutation or failure expectation                                                                                                                   | Audit section                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| FR1            | Type tests against core's Card contract and each platform's types                                                    | each core prop; the sizing props                                                                             | a sizing prop that type-checks, or a renamed core prop, fails                                                                                     | `audit:react-native/Card/api`     |
| FR2, FR7, ORD2 | Unit tests of the frame with two themes                                                                              | each variant; a theme variant; each elevation; a platform entry's `components` override for Card             | a variant painted with another's fill, a border on a variant core draws without one, or an override that does not apply fails                     | `audit:react-native/Card/surface` |
| FR3, ORD1      | Unit tests of padding and the published inset                                                                        | omitted; omitted with a platform override; each step; `0`; a `default` and a `muted` card; a `Layout` inside | a padding off the step, a lost publication, or an inset that differs from core's fails                                                            | `audit:react-native/Card/padding` |
| FR4, FR5       | Unit tests of placement and content                                                                                  | a narrow row; bare words; a view                                                                             | a card that holds its row, a card that scrolls, or bare words that do not render fails                                                            | `audit:react-native/Card/layout`  |
| FR6, AR1, AR2  | VoiceOver and TalkBack checks; unit tests of the accessibility props; captures at the default and largest text sizes | a card with text and a button; bare words at the largest Dynamic Type size and Android font scale            | a card element, a role or label on the card, content the screen reader skips, bare words that do not scale, or a card that clips grown text fails | `audit:react-native/Card/a11y`    |

## Decision log

### DEC-1 — A card's size comes from the layout around it

**Reference:** `component:react-native/Card/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

Core's `width`, `height`, `maxWidth` and `minHeight` take a `SizeValue`, a
number of pixels or any CSS length string. React Native reads numbers and
percentages but not lengths such as `rem`, `vh` or `calc()`, so it cannot
honour the whole `SizeValue`, and a platform never offers a prop it honours
only in part (`spec:AST-082` FR3). On the web a card's width in a row is
already only a preference that a `StackItem` holds; on React Native the
`Stack`, the `StackItem` or the parent view sizes the card, so the sizing props
stay in the web contract.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
