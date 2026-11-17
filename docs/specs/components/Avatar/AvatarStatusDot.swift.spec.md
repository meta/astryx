---
schema_version: 3
template_version: 7
kind: component
id: component:swift/AvatarStatusDot
platform_of: component:AvatarStatusDot
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by:
  [
    packages/native/apple/Tests/AstryxTests/AvatarStatusDotTests.swift,
    packages/native/src/contract/contracts.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture: []
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# AvatarStatusDot (Swift) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `AvatarStatusDot(variant: AvatarStatusDotVariant? = nil, label: String? = nil)` and `AvatarStatusDot(_ props: AvatarStatusDotProps)`, a SwiftUI `View`, placed in `Avatar`'s `status` slot.                     |
| Behavior                | Draws core's dot at the tier for its avatar's size: `success` filled, `neutral` a ring, `error` a minus bar, each in theme tokens with a surface border. Its label joins the avatar's name.                     |
| End-user impact         | A person sees who is online, away, or busy by shape as well as color, and VoiceOver reads it with the person's name ("Ada Lovelace, Online").                                                                   |
| Builder impact          | An app puts the dot in the avatar's trailing closure with a label. A custom icon inside the dot has no Swift form.                                                                                              |
| Compatibility/readiness | Additive: a new view, generated `AvatarStatusDotProps`, and core's name-with-status message in the Swift string catalogs. Draft; built and tested on macOS and the iOS Simulator; device captures are attached. |
| Review checks           | Reject a status shown by color alone, a dot that resizes or moves the avatar, a dot that VoiceOver reads separately inside an avatar, or a color that is not a theme token.                                     |
| Governing rules         | `spec:AST-082` FR4, FR7; `spec:AST-093` FR1–FR5; the Swift component API, slots (S4), theme environment, and accessibility (X1, X6) records under `packages/native/specs/swift/library/`.                       |

This table is a review projection; the body below is authoritative.

## Intent

AvatarStatusDot on Apple platforms shows a person's status on their avatar by
shape and color, sized from the avatar, and gives the avatar its words.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The dot's size tier, fill, border, and shape glyph per variant.
- Reporting its label to the avatar that holds it.

**Does not own / non-goals**

- Where the dot sits and how the name is composed — owned by
  `component:swift/Avatar` (FR7, AR6).
- The meaning of the variants — owned by `component:AvatarStatusDot`.

## Public concepts

| Concept | Closed values or states       | Meaning                                                  | Availability by variant/orientation/state | Default   | Owner                       | Stability    | Invalid-value behavior |
| ------- | ----------------------------- | -------------------------------------------------------- | ----------------------------------------- | --------- | --------------------------- | ------------ | ---------------------- |
| variant | `success`, `neutral`, `error` | filled dot, ring, minus bar                              | always                                    | `success` | `component:AvatarStatusDot` | experimental | none                   |
| tier    | small, medium, large          | 10, 20, 32 point dot for avatars up to 36, 72, and above | from the avatar; small alone              | small     | `component:AvatarStatusDot` | experimental | none                   |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Basis                             | Draft review state |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------ |
| FR1 | The dot MUST take core's tier for its avatar's side: up to 36 points a 10-point dot with a 1-point border and 1-point glyph stroke; up to 72 a 20-point dot, 2-point border, 1.5-point stroke; larger a 32-point dot, 4-point border, 2-point stroke. Outside an avatar it is small.                                                                                                                                                                                                                                                                                         | core `AvatarStatusDot` size tiers | verify             |
| FR2 | `success` MUST fill with `color.success` and draw no glyph; `neutral` MUST fill with `color.backgroundSurface` and draw a ring in `color.textSecondary` on the inner field; `error` MUST fill with `color.error` and draw a round-capped bar in `color.onError` across three quarters of the inner field. Every dot has a `color.backgroundSurface` border. The plates are the strong status fills, `color.success` and `color.error`, and their ink is the matching content role, `color.onSuccess` and `color.onError`, as core's are (`architecture:theme-tokens` INV11). | core `AvatarStatusDot` styles     | verify             |
| FR3 | Both initializers MUST build the same `AvatarStatusDotProps`. Base props come through `AvatarStatusDotProps`: with `isHidden` the view draws nothing; `id` becomes the accessibility identifier.                                                                                                                                                                                                                                                                                                                                                                             | Swift component API A2, A3, A7    | verify             |

### Allowed variation

- **AV1 — Glyph drawing.** The ring and bar are SwiftUI shapes at core's stroke
  widths, not core's SVG.

### Representative states

| State                      | Required invariant                 | Allowed variation |
| -------------------------- | ---------------------------------- | ----------------- |
| each variant               | its fill, glyph, and border        | AV1               |
| each tier                  | its dot, border, and stroke        | none              |
| on a circle and a square   | placed by `component:swift/Avatar` | none              |
| light and dark, two themes | each theme's colors                | none              |

### Transformation and precedence order

- **ORD1 — Tier.** The avatar's side → small outside an avatar.

### Performance and resources

- **PR1 — Shapes only.** The dot draws SwiftUI shapes and loads nothing.

## Accessibility contract

- **AR1 — Inside an avatar.** The dot's label reaches VoiceOver through the
  avatar's name, and the dot is not a separate element (Swift accessibility
  X5).
- **AR2 — Alone.** A labeled dot outside an avatar is one image element named
  by its label; an unlabeled one is hidden (X1).
- **AR3 — Not by color alone.** Each variant has its own shape (X6, Differentiate
  Without Color).
- **AR4 — Rendered tree not measured.** Tests assert what the view sets; the
  rendered accessibility tree is not measured until an app-hosted target
  exists.

## Design relationships

| Anatomy or state | Design requirement                              | Representation authority | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Dot and glyph    | Apple Human Interface Guidelines, Accessibility | prescribed by core       | supporting     | FR1, FR2           |

The component implements design requirements without copying their rationale.

Platform control: SwiftUI has no status badge control for an image, so the dot
is drawn from SwiftUI shapes (`spec:AST-093` FR2). Guideline page:
Accessibility in the Apple Human Interface Guidelines.

Theme values read: `color.success`, `color.error`, `color.onSuccess`, `color.onError`, `color.backgroundSurface`,
`color.textSecondary`.

## Family and system relationships

- `component:AvatarStatusDot` owns the variants and tiers; this record states
  only how Swift draws them.
- `component:swift/Avatar` owns the dot's placement and the composed name.

## Verification map

| Contract | Verification                                                                                                                                                                              | Representative states                                                                                   | Mutation or failure expectation                                                                        | Audit section                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| FR1      | `AvatarStatusDotTests.swift` tier test                                                                                                                                                    | 36, 48, 128 points; no avatar                                                                           | a wrong dot, border, or stroke fails                                                                   | `audit:swift/AvatarStatusDot/tier` |
| FR2      | `AvatarStatusDotTests.swift` variant render, ring sides, and the busy bar in Y2K                                                                                                          | each variant at the large tier; neutral, butter, dark; Y2K light, where on-error and the surface differ | a wrong fill, a missing ring side or glyph, a bar not in on-error, or a glyph on success fails         | `audit:swift/AvatarStatusDot/look` |
| FR3      | `AvatarStatusDotTests.swift` initializer test; `contracts.test.ts`                                                                                                                        | both initializers                                                                                       | differing props fail                                                                                   | `audit:swift/AvatarStatusDot/api`  |
| AR1, AR2 | `AvatarStatusDotTests.swift` composed-name, standalone-trait, and hidden tests; the label the dot reports to its avatar in a rendered tree is not measured (`component:swift/Avatar` AR3) | name with and without a status; a dot alone with and without a label                                    | a composed name without the status label, or a standalone dot without its label and image trait, fails | `audit:swift/AvatarStatusDot/a11y` |

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — A custom icon in the dot.** (`human-api`) Core's `icon` is free-form
  content; it reaches Swift once the contract has the shared icon-name slot.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
