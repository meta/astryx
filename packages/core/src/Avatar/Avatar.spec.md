---
schema_version: 3
template_version: 7
kind: component
id: component:Avatar
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Avatar/Avatar.test.tsx,
    packages/core/src/AvatarGroup/AvatarGroup.test.tsx,
    packages/core/src/Layer/layerScopedContext.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/Avatar.stories.tsx,
  ]
modules: []
families: [family:navigation-destinations]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:internationalization,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-005, spec:AST-009, spec:AST-038]
---

# Avatar component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A sized, shaped identity image with `src`, `fallbackSrc`, `name`, `alt`, `status`, `tooltip`, and optional `href`/`as`/`target`/`rel` or `onClick` interaction.                                                                                                                                 |
| Behavior                | The avatar shows the first image that loads, then initials, then a default icon; it is a named image (composing a status label into its name), a link, or a button, and decorative when it has no name.                                                                                         |
| End-user impact         | Screen-reader users hear who an avatar represents and its status in one name; keyboard users can reveal its tooltip and operate interactive avatars.                                                                                                                                            |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                                                                                                                                    |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. Four implementation gaps are listed under Current-state impact.                                                                                                                                                      |
| Review checks           | Reject a named static avatar that loses its derived `role="img"` without a caller override, a status label unreachable by assistive technology, an ungrouped static avatar whose tooltip only a pointer can reveal, or an interactive avatar that navigates around the shared destination rule. |
| Governing rules         | `family:navigation-destinations`; `spec:AST-005`; `architecture:public-component-api/INV5,INV6,INV8`; `architecture:component-theming-surface/INV2,INV6`; `architecture:internationalization/INV1a`.                                                                                            |

This table is a review projection; the body below is authoritative.

## Intent

Avatar represents a person or entity with an image, or a readable stand-in when
no image loads. It owns the image fallback chain, size and shape, status
placement, the accessible name, the optional name tooltip, and the choice of a
static, link, or button root.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes
- Controlled/uncontrolled behavior: not applicable; image-failure tracking is
  internal state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Caller `tabIndex` replaced on a static avatar (FR9).** A static avatar sets
  its own `tabIndex` after caller props: `0` while it shows a tooltip outside a
  group, otherwise none. A caller `tabIndex` never reaches it, where
  `architecture:public-component-api` INV5 sends supported inputs to the root.
- **Grouped interactive tooltip lost on re-render (FR7, AR4).** In an
  AvatarGroup, a link or button avatar that is not the group's tab stop no
  longer opens its tooltip when keyboard focus reaches it after a re-render that re-attaches its root element: a new `status` element (an inline `status` prop creates one on every parent render), a changed `name`, `alt`, locale, caller ARIA, or caller `ref`, or a tooltip that turns on after mount, so sighted keyboard users lose the name tooltip (WCAG 2.2 2.1.1).
- **Small interactive avatars (AR7).** A link or button avatar at 16 or 20px is
  below the 24 by 24 CSS pixel target of WCAG 2.2 2.5.8, and interactive
  avatars in an AvatarGroup overlap, so they lack the spacing exception.
- **Grouped static avatar tooltip (AR4).** Inside an AvatarGroup, a static
  avatar with a tooltip has no tab stop and is not a roving-focus item, so
  sighted keyboard users cannot reveal its tooltip, where WCAG 2.2 2.1.1 and
  1.4.13 expect hover content to be reachable from the keyboard. A custom
  tooltip string still reaches assistive technology as the avatar's
  description.

## Ownership boundary

**Owns**

- The root, the clipped content area, and the Photo, Initials, and Default icon
  parts.
- The fallback chain, size and shape resolution, and status placement.
- The accessible name, including composing a reported status label.
- The name tooltip and the static tab stop that reveals it.
- The static, link, or button root choice and its focus-visible outline.
- Its adaptations inside an AvatarGroup: group size and shape, the surface
  ring, the overlap offset, the item marker, and dropping its own tab stop.

**Does not own / non-goals**

- The status dot's rendering, size tiers, glyphs, and label reporting — owned by
  `component:AvatarStatusDot`. Avatar owns only where the status slot sits and
  how a reported label enters its name.
- Stacking, overflow, and roving focus across avatars — owned by
  `component:AvatarGroup` and `component:AvatarGroupOverflow`.
- Navigation-destination safety and router substitution — owned by
  `family:navigation-destinations` and `spec:AST-005`.
- Tooltip surface, placement, and open timing — owned by the shared tooltip
  hook.

## Public concepts

| Concept | Closed values or states                                                                                                  | Meaning                                                                | Availability by variant/orientation/state        | Default  | Owner              | Stability | Invalid-value behavior                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------ | -------- | ------------------ | --------- | ---------------------------------------------- |
| Size    | `xsm` (20), `sm` (24), `md` (36), `lg` (48), `xl` (128), or 16, 20, 24, 32, 36, 40, 48, 60, 64, 72, 96, 128, 144, 180 px | Square box size in CSS pixels.                                         | Outside a group; a group's size wins inside one  | `md`     | `component:Avatar` | Stable    | TypeScript rejects other values.               |
| Shape   | `circle`, `rounded`, `square`                                                                                            | Corner radius `--radius-full`, `--radius-element`, or `--radius-none`. | Outside a group; a group's shape wins inside one | `circle` | `component:Avatar` | Stable    | TypeScript rejects other values.               |
| Visual  | photo; fallback photo; initials; default icon                                                                            | What the content area shows (FR2).                                     | All roots                                        | —        | `component:Avatar` | Stable    | —                                              |
| Root    | static; link; button                                                                                                     | Which element the avatar is (FR6).                                     | Resolved from `href` and `onClick`               | static   | `component:Avatar` | Stable    | `href` wins over `onClick`.                    |
| Tooltip | name (default); custom string; none                                                                                      | Text revealed on hover and keyboard focus.                             | All roots                                        | name     | `component:Avatar` | Stable    | A blank name or blank string shows no tooltip. |
| Status  | node or absent                                                                                                           | Corner content, typically an AvatarStatusDot.                          | All roots and shapes                             | absent   | `component:Avatar` | Stable    | A falsy value renders no status slot.          |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Basis                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | The root is a relative, non-shrinking inline-flex box of the resolved size with the shape's radius; it carries the `avatar` target, which reflects `size` and `shape`. A clipped content area fills it with the same radius and suppresses text selection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests |
| FR2 | The content area shows `src` while it has not failed, then `fallbackSrc` while it has not failed, then initials when the name yields any, then a default person icon at 60% of the box. Each image renders with empty `alt` and `object-fit: cover`. A failure is tracked per source, so a changed `src` or `fallbackSrc` is tried again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source and tests |
| FR3 | Initials are the first letter, digit, or emoji of the first and last words of the trimmed `name`, uppercased; leading punctuation in a word is skipped, words with none are dropped, one qualifying word yields one initial, and grapheme clusters are never split. A whitespace-only name counts as absent. Initials and the default icon paint on the `avatar-fallback` target (reflecting `size`) with `--color-neutral`, secondary text, body family, medium weight, and initials at 40% of the box.                                                                                                                                                                                                                                                                                                         | Current source and tests |
| FR4 | A truthy `status` renders in an absolutely positioned slot outside the clipped content area. On a circle it centers on the circle's edge at the bottom inline-end 45° point; on other shapes it sits at the bottom inline-end corner, offset outward by a quarter of its size. Placement mirrors in right-to-left documents.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests |
| FR5 | The resolved name is `alt`, else `name` (blank strings count as absent), composed with the status label as the translated "{name}, {status}" when both exist; a status label alone also names the avatar. The status label comes from a string `label` on the passed element, read on every render, and from a label an AvatarStatusDot reports at any wrapper depth, which wins and updates the root before paint without a second render.                                                                                                                                                                                                                                                                                                                                                                      | Current source and tests |
| FR6 | `href` renders the shared link component (or `as`) with `target` and `rel`; otherwise `onClick` renders a `button type="button"`; otherwise the root is a `div`. Link and button roots carry the `data-avatar-item` marker and the shared focus-visible outline; `onClick` attaches to the link or button. In development, an interactive avatar whose only name is a status label, or that has no name and no caller `aria-label`/`aria-labelledby`, logs a warning.                                                                                                                                                                                                                                                                                                                                            | Current source and tests |
| FR7 | The tooltip shows the trimmed custom string, else the meaningful `name`, placed above, on hover and keyboard focus; `tooltip={false}` or a blank result shows none. A static avatar with a tooltip and outside a group gets `tabIndex={0}` so keyboard users can reveal it. A custom string is added to `aria-describedby` after any caller value; the default name tooltip is not, because it repeats the name. Implementation gap: a grouped link or button avatar that is not the group's tab stop stops opening its tooltip on focus after a re-render that re-attaches its root element: a new `status` element (an inline `status` prop creates one on every parent render), a changed `name`, `alt`, locale, caller ARIA, or caller `ref`, or a tooltip that turns on after mount (Current-state impact). | Current source and tests |
| FR8 | Inside an AvatarGroup in the same layer (`spec:AST-038` FR7, FR8), the group's size and shape win over the avatar's own props; the root gains a 2px surface-colored ring outside its box and the group's negative inline-start overlap; a static avatar adds no tooltip tab stop, and link and button roots keep the `data-avatar-item` marker so they join the group's roving set. An avatar in a hover card, popover, or other layer opened from a group keeps its own size and shape, gets no ring or overlap, and keeps its tooltip tab stop; a link or button avatar there still carries the marker, so the group's roving focus, which selects marked elements in its DOM subtree, still includes it.                                                                                                      | Current source and tests |
| FR9 | `ref` reaches the root of every variant. Supported DOM, ARIA, data, and event props reach the root after the derived ARIA, so a caller `aria-label`, `role`, or `aria-hidden` wins (`architecture:public-component-api` INV5); `data-testid` reaches the root; `xstyle`, `className`, and `style` merge in that order after component styles. Implementation gap: on the static root the component sets `tabIndex` after caller props, so a caller `tabIndex` is replaced (Current-state impact).                                                                                                                                                                                                                                                                                                                | Current source and tests |

### Allowed variation

- **AV1 — Theme paint.** A theme may restyle `avatar` per `size` and `shape` and
  `avatar-fallback` per `size` without changing the fallback chain or the name.
- **AV2 — Router link.** A `LinkProvider` or `as` component may replace the
  native anchor under `family:navigation-destinations`.

### Representative states

| State                 | Required invariant                                                                    | Allowed variation |
| --------------------- | ------------------------------------------------------------------------------------- | ----------------- |
| Photo, named          | `role="img"` root named by `alt` or `name`; inner image has empty `alt`.              | Size, shape.      |
| Failed photo          | Fallback photo, then initials or icon; a new `src` retries.                           | —                 |
| Initials              | Uppercase initials on `avatar-fallback`.                                              | Name.             |
| Unnamed, no status    | `role="presentation"` and `aria-hidden="true"`; default icon; no tooltip.             | —                 |
| Named with status dot | Name reads "{name}, {status}"; the dot sits on the edge or corner.                    | Shape, direction. |
| Link                  | Link root with marker, outline, and `aria-label`.                                     | Router component. |
| Button                | `button type="button"` root with marker, outline, and `aria-label`.                   | —                 |
| Static with tooltip   | `tabIndex={0}`; tooltip on hover and focus.                                           | Tooltip text.     |
| In a group            | Group size and shape; surface ring; overlap; no own tab stop (AR4 gap for a tooltip). | Group overlap.    |

### Transformation and precedence order

- **ORD1 — Visual.** `src` → `fallbackSrc` → initials → default icon.
- **ORD2 — Name.** `alt` → `name`; then compose with status label; a reported
  label → a passed element's `label`. A caller `aria-label` replaces the result.
- **ORD3 — Root.** `href` → `onClick` → static.
- **ORD4 — Size and shape.** An AvatarGroup in the same layer → the avatar's
  own prop → default.

### Performance and resources

- **PR1 — Name updates without re-rendering.** A status label that a wrapped
  AvatarStatusDot reports, or that changes later, updates the avatar's name
  before paint without an extra render of the avatar.

## Accessibility contract

- **AR1 — Named image.** A static avatar with a name is `role="img"` with that
  name; without one, and without a status label, it is `role="presentation"`
  with `aria-hidden="true"`. Inner images and the default icon are decorative.
- **AR2 — Status reaches assistive technology.** Because a `role="img"` root
  prunes its descendants, the status label is composed into the avatar's own
  name (FR5).
- **AR3 — Interactive roots.** Link and button roots keep their native roles and
  take only the `aria-label`; they draw the shared focus-visible outline.
- **AR4 — Keyboard-reachable tooltip.** An avatar's tooltip can be revealed
  from the keyboard (WCAG 2.2 2.1.1, 1.4.13): it opens on keyboard focus, and a
  static avatar outside a group gains a tab stop while it has a tooltip.
  Implementation gaps: inside an AvatarGroup in the same layer a static avatar
  drops that tab stop
  and the group's roving focus covers only link and button avatars, so its
  tooltip opens on hover only; and a grouped link or button avatar that is not the group's tab stop stops opening its tooltip on keyboard focus after a re-render that re-attaches its root element: a new `status` element (an inline `status` prop creates one on every parent render), a changed `name`, `alt`, locale, caller ARIA, or caller `ref`, or a tooltip that turns on after mount.

- **AR5 — Description without duplication.** Only a custom tooltip string
  describes the root; the default name tooltip adds no description.
- **AR6 — Caller ARIA wins.** A caller `aria-label`, `role`, or `aria-hidden`
  overrides the derived value on first render and on later status updates.
- **AR7 — Target size.** An interactive avatar's target is at least 24 by 24
  CSS pixels or has the spacing WCAG 2.2 2.5.8 allows. Implementation gap: a
  link or button avatar at `xsm` (20px) or at 16 or 20px is smaller, and
  interactive avatars in an AvatarGroup overlap their neighbors.

## Design relationships

| Anatomy or state | Design requirement                                                     | Representation authority | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Photo            | The person's image, cropped to fill the shape.                         | Current source and docs  | Prominent      | FR1, FR2           |
| Initials         | A readable stand-in derived from the name.                             | Current source and docs  | Prominent      | FR2, FR3           |
| Default icon     | A generic silhouette when there is no image or name.                   | Current source and docs  | Supporting     | FR2, FR3           |
| Status dot       | Availability shown at the bottom inline-end, outside the clipped area. | Current source and docs  | Supporting     | FR4, FR5, AR2      |

Theming: the root is the `avatar` target and the initials and default icon
surface is the `avatar-fallback` target; the photo inherits the root. The status
dot's targets belong to `component:AvatarStatusDot`. The consumer anatomy names
no root part, so no anatomy-theming block is declared.

## Family and system relationships

- `family:navigation-destinations` and `spec:AST-005` own destination checks for
  the link root; Avatar adopts them through the shared link component.
- `component:AvatarStatusDot` reports its label to the owning Avatar, which composes
  it (FR5) and places the slot (FR4).
- `spec:AST-038` FR7 and FR8 stop the group's context-carried membership at a
  layer boundary; FR8's size, shape, ring, overlap, and tab-stop adaptations
  apply only within one layer, while keyboard ownership is unchanged.
- `component:AvatarGroup` supplies size, shape, and overlap to its members and
  owns roving focus over `data-avatar-item` roots (FR8).
- `architecture:internationalization` owns the catalog behind the composed
  name.

## Verification map

| Contract           | Verification                                                                                                                                                | Representative states                                              | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                    | Audit section           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| FR1–FR3            | `Avatar.test.tsx` fallback, initials, retry, and target tests                                                                                               | Photo, failure, initials, punctuation, emoji, blank name; `lg` box | A wrong initials-or-icon fallback, split grapheme, lost retry, missing target, or wrong `lg` box size fails. Gap: no test sets `src` and `fallbackSrc` together, so the `src`-first order is unchecked, and sizes other than `lg` and numeric sizes are visible only in `Avatar.stories.tsx`.                                                                      | `audit:Avatar/behavior` |
| FR4                | `Avatar.test.tsx` shape and status tests; `Avatar.stories.tsx` status fixtures                                                                              | Every shape with a status; RTL                                     | A missing status slot fails. Gap: the tests assert presence only, so the slot's position, mirroring, and offset are visible only in the rendered fixtures.                                                                                                                                                                                                         | `audit:Avatar/layout`   |
| FR5, AR1, AR2, PR1 | `Avatar.test.tsx` status-name and wrapper suites                                                                                                            | Direct, wrapped, changing, removed labels                          | A lost composed name, extra render, or stale label fails.                                                                                                                                                                                                                                                                                                          | `audit:Avatar/a11y`     |
| FR6, AR3           | `Avatar.test.tsx` interactivity suite                                                                                                                       | Link, button, static, dev warnings                                 | A wrong root, a missing marker, or a missing warning fails. Gap: no test checks the focus-visible outline.                                                                                                                                                                                                                                                         | `audit:Avatar/behavior` |
| FR7, AR4, AR5      | `Avatar.test.tsx` name-tooltip suite                                                                                                                        | Default, custom, disabled, blank                                   | A missing tab stop, a duplicated description, or a lost ref fails. Gap: no test covers a grouped avatar's tooltip after a re-render that re-attaches its root element: a new `status` element (an inline `status` prop creates one on every parent render), a changed `name`, `alt`, locale, caller ARIA, or caller `ref`, or a tooltip that turns on after mount. | `audit:Avatar/a11y`     |
| FR8                | `Avatar.test.tsx` group shape tests; `AvatarGroup.test.tsx` size-cascade, overlap, and roving suites; `layerScopedContext.test.tsx` AvatarGroup layer tests | Inside a group; in a layer opened from a group; outside a group    | An avatar size or shape prop winning inside a group, a lost overlap, an interactive avatar missing from the roving set, or a static avatar in a layer losing its tooltip tab stop fails. Gap: no test asserts the ring, or size and shape inside a layer.                                                                                                          | `audit:Avatar/behavior` |
| FR9, AR6           | `Avatar.test.tsx` consumer-ARIA override suite                                                                                                              | Static and interactive roots                                       | A derived value replacing a caller `aria-label`, `role`, or `aria-hidden` fails. Gap: no test covers a caller `tabIndex`.                                                                                                                                                                                                                                          | `audit:Avatar/a11y`     |
| AR1–AR3, AR5       | Accessibility-tree evidence (`spec:AST-009` FR3)                                                                                                            | Named, decorative, status-composed, interactive                    | Gap: no accessibility-tree check proves the computed roles, names, or description; the unit tests query the DOM.                                                                                                                                                                                                                                                   | `audit:Avatar/a11y`     |
| AR7                | `Avatar.stories.tsx` interactive and size fixtures in a browser                                                                                             | Interactive avatars at every size                                  | Gap: no automated target-size check; the undersized targets are the recorded gap.                                                                                                                                                                                                                                                                                  | `audit:Avatar/a11y`     |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
