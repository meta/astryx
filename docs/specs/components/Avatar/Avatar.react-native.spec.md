---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Avatar
platform_of: component:Avatar
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
families: [family:navigation-destinations]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# Avatar (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | Web's `Avatar` props `src`, `fallbackSrc`, `name`, `alt`, `size` (named and numeric), `shape`, `status`, `tooltip`, `href` and `onClick`, without `as`, `target` and `rel`. React Native adds `initials`.                                                                                                                                                                                                                |
| Behavior                | The photo, then the fallback photo, then initials, then a drawn silhouette, in the theme's gray pairing inside a ring. The status sits outside the clip. A static avatar is a named image; `href` makes a link that opens through the app's link opener, and `onClick` a button. An omitted tooltip shows the name, except in an Item or List row; under a finger a long press shows it on an avatar with no tap action. |
| End-user impact         | A person sees the same face, initials or silhouette as on the web, on any surface in light and dark; VoiceOver and TalkBack read who the avatar is and its status in one name; a small interactive avatar still takes a full-size touch.                                                                                                                                                                                 |
| Builder impact          | Web code that renders an `Avatar` ports unchanged unless it passes `as`, `target` or `rel`. A data source that already has a person's initials passes them as `initials`.                                                                                                                                                                                                                                                |
| Compatibility/readiness | Not released. Draft. The web contract is unchanged. Gap lines under FR2, FR3, FR4 and FR5.                                                                                                                                                                                                                                                                                                                               |
| Review checks           | Reject a fallback colour taken from outside the theme, a status that no screen reader hears, an avatar in a row that adds its own press target by default, a rejected `href` that opens, an interactive avatar smaller than the touch target, or a prop accepted and ignored.                                                                                                                                            |
| Governing rules         | `component:Avatar`; `component:AvatarStatusDot`; `family:navigation-destinations`; `spec:AST-082` FR3, FR5, FR7, FR11; `spec:AST-093` FR1–FR5; DEC-1 and DEC-2 below.                                                                                                                                                                                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

Avatar on React Native is web's picture of a person or team: the same fallback
chain, sizes, shapes, status and accessible name, drawn with the platform's
image view and press behaviour, so it reads on any surface and works under a
finger.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a new platform contract; the web contract is unchanged)
- Controlled/uncontrolled behavior: not applicable; image-failure tracking is internal state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- How React Native renders web's `Avatar`: its props, fallback chain, size,
  shape, fallback paint and status placement (FR1–FR5).
- The root it becomes, its press, its touch target and its tooltip under a
  finger (FR6, FR7).
- Its adaptations inside an AvatarGroup (FR8).

**Does not own / non-goals**

- The meaning of the web props and the initials rule — owned by
  `component:Avatar`.
- The status dot and its label — owned by `component:AvatarStatusDot`.
- Stacking, overflow and focus across avatars — owned by
  `component:AvatarGroup`.
- Destination safety and the link opener — owned by
  `family:navigation-destinations`.
- The tooltip's surface and placement — owned by `component:Tooltip`.

## Public concepts

| Concept    | Closed values or states                                                                                               | Meaning                                                             | Availability by variant/orientation/state        | Default  | Owner                           | Stability    | Invalid-value behavior           |
| ---------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------ | -------- | ------------------------------- | ------------ | -------------------------------- |
| `size`     | `xsm` (20), `sm` (24), `md` (36), `lg` (48), `xl` (128), or 16, 20, 24, 32, 36, 40, 48, 60, 64, 72, 96, 128, 144, 180 | the avatar's side in points or dp at the default text size          | outside a group; a group's size wins inside one  | `md`     | `component:Avatar`              | experimental | an unknown value is a type error |
| `shape`    | `circle`; `rounded`; `square`                                                                                         | the corner radius: `radius.full`, `radius.element` or `radius.none` | outside a group; a group's shape wins inside one | `circle` | `component:Avatar`              | experimental | an unknown value is a type error |
| visual     | photo; fallback photo; initials; silhouette                                                                           | what the avatar shows (FR3)                                         | always                                           | —        | `component:Avatar`              | experimental | none                             |
| root       | static; link; button                                                                                                  | the element the avatar is (FR6)                                     | from `href` and `onClick`                        | static   | `component:Avatar`              | experimental | a rejected `href` leaves no link |
| `tooltip`  | name; words; none                                                                                                     | what a long press shows and the hint reads (FR7)                    | always; omitted is none in an Item or List row   | the name | `component:react-native/Avatar` | experimental | blank words show none            |
| `initials` | absent; one to three letters                                                                                          | letters drawn as given in place of the ones derived from `name`     | when no photo shows                              | absent   | `component:react-native/Avatar` | experimental | blank letters derive from `name` |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Basis                                                                              | Draft review state |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------ |
| FR1 | React Native's `Avatar` MUST take web's `src`, `fallbackSrc`, `name`, `alt`, `size`, `shape`, `status`, `tooltip`, `href` and `onClick` with web's names, defaults (`md`, `circle`, the name as tooltip) and meaning; `size` takes web's named and numeric sizes. Base props follow `spec:AST-082` FR7: `id` identifies the root and `isHidden` hides it. It MUST NOT offer a prop it does not honor: `as` chooses a web element and `target` and `rel` are HTML link attributes, while a link here opens through the app's link opener (FR6).                                                                                                                                                                                                      | `component:Avatar`; `spec:AST-082` FR3, FR5, FR7                                   | settled            |
| FR2 | React Native MUST add `initials`: letters a data source already has, such as a server's choice or a short form of a name in another script, drawn as given in place of the ones derived from `name`. `name` or `alt` still names the avatar; `initials` with neither warns once in development. An unset `initials` changes nothing.                                                                                                                                                                                                                                                                                                                                                                                                                | `spec:AST-082` FR5                                                                 | settled            |
| FR3 | The avatar MUST show `src`; after it fails, `fallbackSrc`; then initials; then a silhouette of a head and shoulders. A source that failed is not tried again until it changes. The photo fills the shape (`cover`) and is no element of its own. Initials follow web's rule: the first letter, digit or emoji of the first and last words of the trimmed `name`, punctuation skipped, uppercased in the app's locale, a whole emoji or joined emoji sequence kept; a name with none shows the silhouette.                                                                                                                                                                                                                                           | `component:Avatar` FR2, FR3                                                        | verify             |
| FR4 | The avatar MUST be a square of its size at the default text size, grown with the text size up to 1.6 times and never shrunk, clipped to its shape's radius, with its initials at 40% of the side in the body family at medium weight, as the Swift record states. With no photo it draws the theme's gray pairing: a `color.backgroundGray` fill, `color.textGray` initials and a `color.iconGray` silhouette, inside a `size.borderWidth` ring of `color.borderEmphasized` within its frame (DEC-2); a photo draws no ring.                                                                                                                                                                                                                        | `component:Avatar` FR1, FR3; `spec:AST-082` FR11; DEC-2                            | verify             |
| FR5 | A `status` MUST draw in a slot outside the avatar's clip that takes no touches: on a circle centred on the circle's edge at the bottom trailing 45° point, on a rounded or square avatar at the bottom trailing corner, overhanging it by a quarter of its size; placement is logical, so it mirrors in right-to-left. The label an `AvatarStatusDot` in the slot reports, at any wrapper depth, joins the avatar's name as the catalog's "{name}, {status}", and a status label alone names the avatar.                                                                                                                                                                                                                                            | `component:Avatar` FR4, FR5; `component:AvatarStatusDot`                           | verify             |
| FR6 | An `href` that `family:navigation-destinations` accepts MUST make the avatar a link: a press runs `onClick` and then opens the destination through the app's link opener, the `LinkProvider` above it, else the system's URL opener. A rejected destination reaches no opener and leaves no link role. Otherwise `onClick` makes a button, and with neither the avatar is static. A link or button avatar draws the platform's press feedback in its shape, a ripple on Android, shows the theme's focus outline when it has focus, and reaches the platform's minimum touch target (44 pt on iOS, 48 dp on Android) through its hit area without changing its size. An interactive avatar with neither `name` nor `alt` warns once in development. | `component:Avatar` FR6, AR7; `family:navigation-destinations`; `spec:AST-082` FR11 | verify             |
| FR7 | `tooltip` MUST resolve as web's does: omitted or `true` is the name, a string is those words, and `false` or blank words are none; an omitted `tooltip` inside an Item or List row is none (DEC-1). Words other than the name are the avatar's accessibility hint. On an avatar with no tap action, a long press shows the words through the tooltip surface and the release hides them; on a link or button avatar a hold is a press when the finger lifts, as on an avatar with no tooltip.                                                                                                                                                                                                                                                       | `component:Avatar` FR7; DEC-1                                                      | verify             |
| FR8 | Inside an AvatarGroup, the group's size and shape MUST win over the avatar's own. The avatar slides under the one before it by a quarter of its size and draws a 2 dp ring in `color.backgroundSurface` outside its box. The initials of an avatar the next one covers centre in its uncovered part, so every visible avatar's letters stay whole.                                                                                                                                                                                                                                                                                                                                                                                                  | `component:Avatar` FR8                                                             | verify             |

- FR2 gap: the package's Avatar also takes `onPress`, a second name for
  `onClick`; when both are given, only `onPress` runs.
- FR2 gap: the package's Avatar also offers `color`, a palette pairing for the
  fallback chosen at each call site; FR4 takes the fallback's colours from the
  theme only.
- FR3 gap: on a JavaScript engine without grapheme segmentation, initials cut
  an emoji sequence at its first code point.
- FR4 gap: the avatar keeps its size, and its initials their size, at every
  text size.
- FR5 gap: on a circle the dot centres 30° below the trailing horizontal, not
  at the 45° point.
- FR5 gap: a status element other than `AvatarStatusDot` adds nothing to the
  name; web also reads a string `label` on the passed element.

### Allowed variation

- **AV1 — Platform press.** The press feedback is the platform's: a ripple on
  Android and a highlight on iOS.
- **AV2 — Image loading.** How the platform's image view fetches and caches a
  photo is its own; only the fallback order is fixed.

### Representative states

| State                                     | Required invariant                                                        | Allowed variation     |
| ----------------------------------------- | ------------------------------------------------------------------------- | --------------------- |
| photo, named                              | an image element named by the name; no ring                               | size, shape           |
| failed photo                              | the fallback photo, then initials or the silhouette; a new `src` is tried | none                  |
| initials                                  | the gray pairing in a ring; letters at 40% of the side                    | `initials` given      |
| unnamed, no status                        | hidden from assistive technology; the silhouette                          | none                  |
| named with a status dot                   | "{name}, {status}"; the dot on the edge or corner                         | shape, direction      |
| link                                      | link role; press runs `onClick`, then opens                               | the app's link opener |
| rejected `href`                           | no link role; nothing opens                                               | none                  |
| in an Item or List row, `tooltip` omitted | no tooltip and no press target of its own                                 | none                  |
| static with a tooltip                     | a long press shows the words; the hint reads them                         | the words             |
| in a group                                | the group's size and shape; the surface ring; the overlap                 | none                  |
| largest text size                         | the avatar at 1.6 times its size                                          | none                  |

### Transformation and precedence order

- **ORD1 — Visual.** `src` → `fallbackSrc` → `initials` as given → initials of
  `name` → silhouette.
- **ORD2 — Name.** `alt` → `name`, then joined with a reported status label.
- **ORD3 — Root.** An accepted `href` → `onClick` → static.
- **ORD4 — Tooltip.** An explicit `tooltip` → none in an Item or List row → the
  name.
- **ORD5 — Size and shape.** An AvatarGroup → the avatar's own → the default.

### Performance and resources

- **PR1 — Quiet when static.** A static avatar without a tooltip is a plain
  view: no press handling and no hit-area measurement.
- **PR2 — Initials once per name.** Initials are worked out once for each name
  and locale, so the same people across rows and renders cost nothing more.

## Accessibility contract

- **AR1 — Named image.** A static avatar with a name is an image element
  named by it, joined with its status label (FR5); without a name or status it
  is hidden from assistive technology. The photo, initials and silhouette are
  never elements of their own.
- **AR2 — Interactive roots.** A link or button avatar keeps the link or button
  role and the same name, and its press is reachable by VoiceOver and TalkBack
  activation.
- **AR3 — The tooltip is a hint.** Tooltip words other than the name are read
  as the hint after the name; the name is never read twice.
- **AR4 — Touch target.** A link, button or long-press avatar takes a touch at
  the platform's minimum target at every size (FR6).

## Design relationships

| Anatomy or state        | Design requirement                                            | Representation authority           | Hierarchy role | Component contract |
| ----------------------- | ------------------------------------------------------------- | ---------------------------------- | -------------- | ------------------ |
| Photo                   | the person's image, cropped to fill the shape                 | prescribed by core                 | prominent      | FR3                |
| Initials and silhouette | a readable stand-in in the theme's gray pairing inside a ring | prescribed by core; ring per DEC-2 | prominent      | FR3, FR4           |
| Status dot              | availability at the bottom trailing edge, outside the clip    | prescribed by core                 | supporting     | FR5                |

The component implements design requirements without copying their rationale.

Platform control: none (`spec:AST-093` FR2); neither platform has an avatar
view. The platform's image view draws the photo, and the press is the
platform's press with its feedback. Guideline pages: Images and Accessibility
in the Apple Human Interface Guidelines; Accessibility in Material 3
(`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): `radius.full`, `radius.element`,
`radius.none`, `color.backgroundGray`, `color.textGray`, `color.iconGray`,
`color.borderEmphasized`, `color.backgroundSurface`, `size.borderWidth`, the
body font family at medium weight, the theme's focus outline, and the text
size.

## Family and system relationships

- `component:Avatar` owns the props, the fallback chain and the initials rule;
  this record states only what React Native adds or does differently.
- `component:AvatarStatusDot` reports its label to the avatar, which joins it to
  the name (FR5).
- `component:AvatarGroup` supplies size and shape and owns focus across its
  avatars (FR8).
- `family:navigation-destinations` decides which destinations open (FR6).
- `component:Tooltip` draws the surface a long press shows (FR7).

## Verification map

| Contract      | Verification                                                                                                 | Representative states                                                                                                      | Mutation or failure expectation                                                                                  | Audit section                       |
| ------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| FR1, FR2      | Type tests of the exports against web's types; a contract drift test                                         | each prop; `as`, `target` and `rel` absent; `initials` with and without a name                                             | a missing web prop, a different default, an accepted and ignored prop, or no development warning fails           | `audit:react-native/Avatar/api`     |
| FR3           | Unit tests of the fallback chain and the initials rule                                                       | a failing `src` with and without `fallbackSrc`; a changed `src`; punctuation, digits, emoji and joined emoji; a blank name | a wrong fallback order, a lost retry, or a split emoji sequence fails                                            | `audit:react-native/Avatar/visual`  |
| FR4           | Unit tests of size and paint; Simulator and emulator captures in light and dark and at the largest text size | each named and numeric size; each shape; photo and fallback on body, muted and card surfaces                               | a size that ignores the text size, a fallback colour outside the theme, or a ring around a photo fails           | `audit:react-native/Avatar/visual`  |
| FR5, AR1      | Unit tests of status placement and the composed name; VoiceOver and TalkBack checks                          | each shape with a dot; right-to-left; a wrapped dot; a changing label                                                      | a dot inside the clip, an unmirrored dot, or a status a screen reader does not hear fails                        | `audit:react-native/Avatar/status`  |
| FR6, AR2, AR4 | Unit tests of the root, the link opener and the hit area; touch checks on the Simulator and the emulator     | accepted and rejected `href`; `onClick`; static; `xsm` interactive                                                         | a rejected destination that opens, a wrong role, or a touch target under the platform minimum fails              | `audit:react-native/Avatar/press`   |
| FR7, AR3      | Unit tests of tooltip resolution and the hint; long-press checks                                             | omitted in and out of a row; words; `false`; a static and an interactive avatar                                            | a row avatar with a press target of its own by default, a hold that swallows a press, or a name read twice fails | `audit:react-native/Avatar/tooltip` |
| FR8           | Unit tests in a group; captures of a stack                                                                   | several avatars with initials; mixed sizes given to the members                                                            | an avatar's own size winning, a lost ring or overlap, or covered letters fails                                   | `audit:react-native/Avatar/group`   |

## Decision log

### DEC-1 — An avatar in a row shows no tooltip unless asked

**Reference:** `component:react-native/Avatar/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

Inside an Item or List row the row already names the person and owns the press
and the long press, so an omitted `tooltip` there is none; a tooltip per row
would be a hidden second press target. An explicit `tooltip` is honoured
anywhere.

### DEC-2 — The fallback reads on every surface

**Reference:** `component:react-native/Avatar/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

Initials and the silhouette sit on the theme's gray pairing inside a hairline
ring of `color.borderEmphasized`, so the circle reads on muted, body and card
surfaces in light and dark mode. A photo carries its own edge and draws no
ring.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
