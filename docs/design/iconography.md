---
schema_version: 1
template_version: 1
kind: design
id: design:iconography
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [ernestt, cixzhang]
review_triggers: [visual, interaction, theming, accessibility]
verified_by: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:icon-resolution-and-component-slots,
    architecture:theme-authoring-contract,
  ]
components: [component:Icon, component:Table]
families: []
deciding_specs: []
---

# Iconography design specification

## User intent

Icons are simple graphic interface elements that represent common actions,
concepts, and states. They should help people understand a surface, complete a
task, and find their way without adding visual noise or forcing them to decode
inconsistent symbols.

## Design principles

- **DR1 — Clear.** Icons MUST use simple, recognizable forms that communicate
  their intended meaning and aid comprehension.
- **DR2 — Intentional.** Every icon MUST have a purposeful role in its local
  context. Designers SHOULD evaluate the whole container and page before adding
  another icon so decoration does not increase cognitive load.
- **DR3 — Consistent.** Repeated concepts, actions, geometry, size roles, and
  artwork styles SHOULD remain coherent across the product. Components SHOULD
  reuse system semantic icons instead of introducing bespoke symbols for an
  existing meaning.
- **DR4 — Size follows semantic role.** A glyph MUST be sized for what it does,
  not merely for the nearest available space or the intrinsic proportions of its
  artwork.
- **DR5 — Outlined artwork is the default.** When an icon family offers outlined
  and filled versions of the same symbol, components SHOULD start with the
  outlined version unless a permitted filled use applies.
- **DR6 — Color supports meaning.** Icon color MUST follow an approved foreground,
  semantic, or constrained non-semantic role. Color alone MUST NOT communicate a
  concept or state.
- **DR7 — Glyph and target are separate.** Icon artwork MUST NOT be used as a
  substitute for an interactive container, operable hit target, focus treatment,
  or accessible name.

## Anatomy and hierarchy

### Meaning roles

| Role                | Purpose                                                    | Required relationship                                                                                      |
| ------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| informative icon    | Adds information or meaning beyond an adjacent label       | May stand alone only with an accessible name and enough explanation to understand it                       |
| decorative icon     | Reinforces nearby text without adding independent meaning  | MUST accompany content that already communicates the meaning; normally uses outlined artwork               |
| interactive icon    | Represents an action inside an interactive control         | The containing Button, IconButton, link, or other control owns interaction, state, focus, name, and target |
| semantic icon       | Reinforces information, success, warning, or error meaning | Uses the matching semantic icon and color together; the meaning remains available independently of color   |
| object or logo icon | Identifies a specific object, product, or brand            | Used only when recognition of that object is relevant; not as generic decoration for a category or section |

### Size roles

Astryx exposes four Icon sizes. Values are px-equivalents at a 16px root; Icon
continues to scale with the document's root font size.

| Role              | Current Icon size | Purpose and current relationship                                                  |
| ----------------- | ----------------- | --------------------------------------------------------------------------------- |
| compact indicator | 12px (`xsm`)      | Supporting indicators, metadata, and dense affordances                            |
| standard control  | 16px (`sm`)       | Most controls and disclosure affordances; current Button `sm` and `md` icon boxes |
| prominent control | 20px (`md`)       | Large controls and visually important icon-only actions; current Button `lg` box  |
| display or object | 24px (`lg`)       | Large standalone symbols, object identity, or exceptional display-scale treatment |

These roles describe visual intent, not new public Icon size names. Component
contracts own their role assignment. Bare Icon currently defaults to `md` (20px),
while many composing controls explicitly constrain their icon slot to 16px or
20px. An open contextual-sizing change may make an omitted Icon size inherit from
its owning control; this record does not depend on that implementation landing.

### Outlined and filled artwork

Outlined artwork is the starting point. Filled artwork MAY be used when one or
more of these conditions applies:

1. The icon also conveys an active or on state, such as a toggle or selected
   navigation item.
2. The icon is 12px-equivalent or smaller and fill demonstrably improves
   recognition.
3. An informational icon carries a persistent semantic color, such as information,
   success, warning, or error status.
4. The icon intentionally needs higher emphasis, such as a primary action or
   object identity.
5. The icon appears on media or another visually busy background and fill improves
   contrast or recognition.
6. The icon is a logo or brand mark whose canonical artwork is filled.

The shape of a symbol or a secondary foreground color is not enough by itself to
require fill. Astryx's current fallback chevrons, close mark, search icon, and sort
arrows are outlined at every size, while status icons are filled and intrinsically
solid marks such as more and stop remain solid. Peer controls SHOULD use a cohesive
artwork language, but cohesion does not override their semantic roles.

A filled exception MUST remain purposeful and local. It does not make filled
artwork the global default. Intrinsically solid primitives with no meaningful
outlined counterpart are not treated as filled variants merely because they
contain a solid shape.

## State representation

| State or context         | Required representation                                                                    | Allowed variation                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| rest                     | Uses the role's normal size, color, and outlined artwork unless a filled exception applies | Theme artwork and optical adjustment may vary                                           |
| active or on             | May change from outlined to filled while preserving one recognizable symbol                | Another established non-fill state treatment may reinforce the state                    |
| compact indicator        | Remains subordinate and recognizable; fill is allowed at 12px or smaller when it helps     | Size-specific artwork may improve legibility                                            |
| semantic status          | Pairs the status icon with its matching semantic color and accessible meaning              | Filled artwork may provide persistent emphasis                                          |
| disabled                 | Uses the approved disabled foreground without losing recognition                           | Artwork stays consistent with the role                                                  |
| on media or busy surface | Retains contrast and recognition against variable content                                  | Filled artwork and an inherited high-contrast foreground may be used                    |
| alternate theme          | Meaning, role hierarchy, and outlined/filled intent remain recognizable                    | Icon library and exact artwork may differ; role-specific sizing needs an exposed target |

An outlined-to-filled change MUST NOT be the only cue for a state whose
distinction must remain perceivable. Programmatic state, accessible naming,
position, color, or another established treatment must continue to carry it.

## Color roles

Astryx Icon currently exposes `primary`, `secondary`, `tertiary`, `disabled`,
`accent`, `success`, `warning`, `error`, and `inherit`, plus named palette colors.
The design intent is:

- **Primary** carries ordinary high-emphasis icon content.
- **Secondary and tertiary** carry supporting icon content. Their current token
  mapping may coincide, but the semantic role remains distinct.
- **Disabled** communicates unavailable icon content without implying status.
- **Accent** communicates selected emphasis or information when the owning
  component assigns that meaning.
- **Success, warning, and error** are reserved for matching semantic outcomes.
- **Inherit** lets the owning control or surface provide the correct foreground,
  including media and other busy surfaces.
- **Named palette colors** do not acquire semantic meaning from Icon. Use them only
  when an owning component or product defines and consistently applies a
  non-semantic category mapping.

`placeholder` and `onMedia` are not current Icon color values. A component may
create those visual roles through inheritance or a qualified theme target, but
this design record does not invent new Icon API values.

## Responsive and input behavior

- **DR8 — Density does not erase meaning.** A dense layout MAY choose the compact
  role for supporting indicators, but primary controls MUST remain recognizable
  as controls.
- **DR9 — Input adaptation belongs to the target.** Touch or coarse-pointer modes
  MAY increase the containing target or spacing without changing the glyph when
  its semantic role is unchanged.
- **DR10 — Role changes are explicit.** Responsive composition MUST NOT silently
  move an icon among compact, standard-control, prominent-control, and display
  roles solely to make it fit; the component or family contract must establish
  that variation.
- **DR11 — Compact artwork preserves recognition.** At 12px-equivalent or smaller,
  a theme MAY choose filled or otherwise optically simplified artwork when an
  outlined asset loses clarity. A 16px icon does not become filled merely because
  it is small; one of the filled-use criteria must still apply. The symbol's
  meaning and surrounding layout must remain unchanged.

## Composition guidance

### Icons in controls

- An interactive icon MUST be placed in an IconButton, Button, link, or another
  control that supplies interaction states, focus, an accessible name, and an
  adequate target.
- A bare Icon MUST NOT become interactive by attaching a click handler without an
  owning control.

### Icons in tabs

- A leading tab icon MAY identify a destination or reinforce the visible label.
  Decorative icons SHOULD be omitted when they add distraction or width without
  useful recognition.
- A selected icon MAY change to reinforce the selected state when the label and
  tab semantics continue to carry that state.
- Status icons, badges, and status dots belong in the tab's end-content or status
  position rather than replacing the tab label.

### Icons in tokens and badges

- Informational status treatment pairs the semantic icon and color so the
  combination communicates status without arbitrarily recoloring the container.
- A token or badge MAY coordinate its surface and icon through a component-owned
  semantic variant; a nested icon alone does not redefine the container's meaning.

### Icons in links

- Links SHOULD primarily use text. An icon MAY supplement that text when it adds
  a useful visual cue.
- An icon-only link MAY be used when the destination is recognizable in context
  and the Link receives a non-empty accessible `label`. Prefer Button with `href`
  when the interaction should read as a control rather than inline navigation.

### Icons in lists

- Non-selectable description and menu lists SHOULD normally use outlined icons at
  the standard 16px-equivalent size and a supported foreground role.
- Filled artwork, compact sizing, or named palette color MAY be used when another
  rule in this record applies; decoration alone is not sufficient justification
  for added emphasis.

### Icons in headers

- A header MAY include object media when the heading identifies a specific object
  and the icon materially aids recognition.
- Most category and section headings SHOULD NOT include an icon; generic media
  adds noise without clarifying the section.

### Icons in navigation

- Navigation icons MUST be chosen intentionally: use a clear, simple symbol that
  represents the destination rather than a generic decorative mark.
- Selected navigation MAY use a component-owned outlined-to-filled pair when text,
  `aria-current`, or another established treatment continues to identify selection.

## Accessibility intent

- Informative icons need an accessible image name when the information is not
  already available in text. Explanatory text or a tooltip should be available
  when the symbol alone may be ambiguous.
- Decorative icons expose no duplicate name and remain paired with visible text
  that communicates the meaning.
- Icon artwork MUST remain recognizable at its rendered size. Astryx does not
  require every icon at 16px or below to be filled: current fallbacks are mostly
  outlined, with filled status icons and intrinsically solid marks. Prefer
  size-specific or optically adjusted artwork when available; use fill only when
  a filled-use criterion above applies.
- Icon foregrounds MUST maintain applicable contrast against their backgrounds.
- Interactive icons need adequate surrounding space for recognition and an
  operable target owned by their control.

## Representative examples

- A grouped-row disclosure chevron is an interactive control for an entire
  section, so its intended standard role is 16px-equivalent rather than a 12px
  supporting indicator. Astryx's current fallback chevron remains outlined.
- A table sort-direction arrow is a compact indicator associated with a column
  heading, so it uses the 12px-equivalent role while the button and `aria-sort`
  carry interaction and state. It does not require filled artwork.
- A persistent semantic information cue may use filled artwork and the accent
  color when nearby content or an accessible name explains it.
- An on/off control may pair outlined artwork for off with the corresponding
  filled artwork for on while its semantic state remains available independently.
- A large icon-only Button uses a 20px-equivalent prominent-control glyph when the
  containing target and spacing support it; icon-only does not automatically mean
  prominent.
- A 24px-equivalent icon is reserved for display-scale or object treatment rather
  than the default icon-button glyph.
- A non-selectable list item normally uses a standard-size outlined icon in a
  primary or secondary foreground.

## Visual references

No normative assets are included. Public-safe examples of meaning roles, the
12/16/20/24 size ladder, outlined/filled exceptions, color roles, and
representative compositions should be added under
`docs/design/assets/iconography/` before promotion.

## Component contract links

- `component:Icon` owns the shared 12/16/20/24 size vocabulary, bare-Icon
  `md` default, scaling behavior, target, color API, and rendering semantics; this
  record assigns design intent to role, color, and artwork selection.
- Interactive components own their target, state, focus, accessible name, and icon
  slot geometry; Icon remains the glyph inside that owner.
- `component:Table` owns which generated Table affordances are compact indicators
  or standard controls. Grouped-row disclosure is the first candidate for an
  explicit standard-control link after this record becomes current.
- `architecture:icon-resolution-and-component-slots` owns semantic-name and
  artwork resolution. A component selects placement, size, color, and state before
  the registry supplies artwork; the registry is not the owner of those roles.
- `architecture:component-theming-surface` owns theming guarantees. The shared
  Icon target reflects `size` and `color`, so themes may coherently style existing
  values. A local component-role override still requires a qualified owning target
  with the relevant property guarantee; this record does not create one.

## Decision log

### DEC-1 — Outlined artwork is the default with deliberate filled exceptions

**Reference:** `design:iconography/DEC-1`
**Decider:** pending design-owner approval

Start with outlined artwork when a meaningful pair exists. Use the filled
counterpart only for active state, verified compact recognition at 12px or smaller,
persistent semantic status, deliberate emphasis, busy backgrounds, or canonical
logos. Maintain cohesion among peer controls without treating a symbol's shape or
secondary color as automatic permission to fill it.

Rejected: using filled artwork as the universal default, filling every icon at
16px or below, filling chevrons and close marks categorically, using fill as the
sole state cue, or selecting fill simply because the asset exists.

### DEC-2 — Astryx uses a 12 / 16 / 20 / 24 role ladder

**Reference:** `design:iconography/DEC-2`
**Decider:** pending design-owner approval

Use 12px-equivalent for compact supporting indicators, 16px-equivalent for
standard controls and disclosures, 20px-equivalent for prominent controls such as
large icon buttons, and 24px-equivalent for display-scale or object treatment.
Bare Icon currently defaults to 20px-equivalent `md`; composing components may
constrain their icon slots independently.

Rejected: importing the older three-size 12/16/24 profile unchanged, calling 16px
the primitive Icon default, using one size for every icon, or selecting size from
available space without regard to meaning.

### DEC-3 — Informative and decorative icons have different content obligations

**Reference:** `design:iconography/DEC-3`
**Decider:** pending design-owner approval

An informative icon may carry meaning beyond its label and therefore needs an
accessible name and enough explanation when used independently. A decorative icon
adds no independent meaning, stays paired with text, and is hidden from assistive
technology to avoid duplicate announcements.

Rejected: treating every icon as informative, or allowing a decorative icon to
stand alone without a label.

### DEC-4 — Themes tune shared and component roles at their owning surface

**Reference:** `design:iconography/DEC-4`
**Decider:** pending design-owner approval

A theme may replace artwork for a shared semantic icon name and may coherently
tune an existing `Icon.size` value through the shared Icon target. A local role
such as one component's disclosure control should instead use a qualified
component-owned target when that target exists and guarantees the relevant
property. Components continue to own placement, state, and accessible semantics;
this record creates no new target or guarantee.

Rejected: adding ad hoc size names, changing a shared size solely to affect one
component, using the artwork registry as the owner of component behavior or state,
or assuming every icon-bearing role is independently themeable today.

## Open questions

- **OQ1 — Theme-target rollout.** Which existing component roles need dedicated
  qualified targets for theme authors to tune size, color, or artwork
  independently?
- **OQ2 — Current conformance.** Which shipped callsites differ from the current
  12/16/20/24 role ladder, outlined default, or composition guidance and need an
  explicit component-owned exception?
- **OQ3 — Normative evidence.** Which public-safe examples best demonstrate the
  meaning roles, size and artwork rules, colors, and composition across the
  reference system theme and a deliberately different theme personality?

## Content boundary

This file defines public visual, composition, and accessibility intent for
iconography. It does not prescribe a particular icon library, asset-management
workflow, request process, implementation framework, prop syntax, target selector,
registry descriptor, or migration tooling. It does not change Icon's released
size vocabulary or default, define hit-target thresholds, choose individual SVG
geometry, or implement theme overrides.
