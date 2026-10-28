---
schema_version: 3
template_version: 7
kind: component
id: component:Thumbnail
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Thumbnail/Thumbnail.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/Thumbnail.stories.tsx,
    .github/visual-baseline/manifest.json,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:internationalization,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-009, spec:AST-085, spec:AST-086]
---

# Thumbnail component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | A 64px square image preview with `src`, `alt`, `label`, `isLoading`, `isDisabled`, an optional `onClick` open action, and an optional `onRemove` action revealed per `showRemoveOn`. |
| Behavior                | The preview shows a skeleton, the image, an upload overlay, or a placeholder; it is a named group whose open and remove actions are separate buttons.                                |
| End-user impact         | Screen-reader users hear the file and image in one group name and reach "Open …" and "Remove …" buttons; keyboard and touch users can always reach a hover-revealed remove button.   |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                         |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. Six implementation gaps are listed under Current-state impact.                                            |
| Review checks           | Reject a hover-only remove button that leaves the tab order, a name on a roleless element, an image exposed without `alt`, or a busy spinner that announces itself.                  |
| Governing rules         | `spec:AST-085/FR1`; `spec:AST-086/FR8`; WCAG 2.2 2.5.8; `architecture:public-component-api/INV5,INV6,INV8`; `architecture:internationalization/INV1a`.                               |

This table is a review projection; the body below is authoritative.

## Intent

Thumbnail previews one image attachment in a compact square, with optional
open and remove actions. It owns the preview's loading, error, and upload
states, its accessible group name, and the placement and reveal of its remove
action.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes
- Controlled/uncontrolled behavior: not applicable; image-failure tracking is
  internal state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Caller `role` replaces the group role (FR7, AR1).** A caller `role`, such
  as `none` or `img`, overwrites `role="group"`, leaving the composed name on
  an element that may not take it, where `architecture:public-component-api`
  INV5 keeps component-owned semantics from being overwritten.
- **Joined name outside the catalog (FR3).** With both `label` and `alt`, the
  group name "{label} — {alt}" is assembled at the call site rather than from
  one catalog message, so a locale cannot reorder or re-punctuate it
  (`architecture:internationalization` INV1a).
- **Remove target below 24px (AR4).** On a fine pointer the remove button's hit
  area is 20 by 20 CSS pixels and it overlaps the open action, where WCAG 2.2
  2.5.8 requires 24 by 24 or spacing. On a coarse pointer it is 24 by 24.
- **Label tooltip not reachable by keyboard (FR3).** The label tooltip
  attaches to the root group, which is not focusable, so keyboard focus on the
  open or remove button does not reveal it (WCAG 2.2 2.1.1). The label still
  reaches assistive technology through the group and button names.
- **Two focus indicators on Open and Remove (FR4).** The image container
  outlines whenever it contains keyboard focus, and both the open and the
  remove button keep their own focus ring, so focusing either draws two
  indicators, where `architecture:interaction-modality` INV3 allows one per
  focus move.
- **Disabled state not reflected on the target (FR6).** The `thumbnail`
  target reflects no state, so a theme cannot style the disabled state there (`architecture:component-theming-surface` INV6).

## Ownership boundary

**Owns**

- The root group, the square image container, and the Image, Placeholder,
  Skeleton, Upload overlay, and Remove button parts.
- The visual-state choice and image-failure retry.
- The group name, the open-button name, and the remove-button name.
- The remove button's placement, scrim, hit area, and hover reveal.
- The upload busy announcement.

**Does not own / non-goals**

- Lightbox or detail view opened by `onClick` — owned by the product callsite.
- Collections of attachments and upload transport — owned by composing
  components and the product callsite.
- Button, Skeleton, Spinner, Icon, and Tooltip internals — owned by those
  components; Thumbnail composes them.
- The hover-and-focus reveal mechanism — owned by the shared container-reveal
  utility.

## Public concepts

| Concept       | Closed values or states                                                   | Meaning                                                                                       | Availability by variant/orientation/state         | Default     | Owner                 | Stability | Invalid-value behavior           |
| ------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------- | --------------------- | --------- | -------------------------------- |
| Visual state  | skeleton; image or placeholder under the upload scrim; image; placeholder | What the image container shows (FR2).                                                         | Resolved from `src`, `isLoading`, and load errors | placeholder | `component:Thumbnail` | Stable    | —                                |
| Open action   | present; absent                                                           | `onClick` adds an "Open …" button over the image; inert while loading or disabled (FR4).      | With `onClick`                                    | absent      | `component:Thumbnail` | Stable    | —                                |
| Remove action | present; absent                                                           | `onRemove` adds a "Remove …" button in the top inline-end corner; inert while disabled (FR5). | With `onRemove`                                   | absent      | `component:Thumbnail` | Stable    | —                                |
| Remove reveal | `hover`, `always`                                                         | Whether the remove button is shown at rest.                                                   | Only with `onRemove`                              | `hover`     | `component:Thumbnail` | Stable    | TypeScript rejects other values. |
| Disabled      | enabled; disabled                                                         | Dims the thumbnail; its actions stay focusable and announced as disabled (FR6).               | All states                                        | enabled     | `component:Thumbnail` | Stable    | —                                |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Basis                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | The root is a 64px-wide, non-shrinking, isolated inline-flex column carrying the `thumbnail` target. It holds a square image container with `--radius-element` corners, clipped overflow, and a `--color-neutral` background.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and tests |
| FR2 | `isLoading` without `src` shows a Skeleton; `isLoading` with `src` shows the image, or the placeholder glyph if that `src` failed, under an overlay-colored upload scrim holding a small on-media Spinner; `src` without loading shows the image, cover-fitted, with a 1px inset border; no `src`, or a `src` that failed to load, shows a secondary-colored image placeholder glyph. A failure is tracked per `src`, so a changed `src` is tried again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current source and tests |
| FR3 | The root is `role="group"` named "{label} — {alt}" when both exist, else `label`, else `alt`, else the translated "Thumbnail"; a caller `aria-label` or `aria-labelledby` reaches the root after it and names the group instead. A joined name is one catalog message (`architecture:internationalization` INV1a); implementation gap: "{label} — {alt}" is joined at the call site (Current-state impact). A defined `label` also wraps the thumbnail in a Tooltip showing it, which also sets the label as the group's accessible description; `label` is never rendered inline. A tooltip can be revealed from the keyboard (WCAG 2.2 2.1.1). Implementation gap: the tooltip attaches to the non-focusable root and opens on hover and touch only; focusing the open or remove button does not show it (Current-state impact). In development, a `src` with no `alt`, `label`, `aria-label`, or `aria-labelledby` logs a warning. | Current source and tests |
| FR4 | With `onClick`, a full-size `button type="button"` named "Open {name}" wraps the image content and calls `onClick`; hover and pressed overlays show for mouse and touch. While loading or disabled, Open stays mounted and inert, so a focused Open keeps focus (`spec:AST-085` FR1, FR4, FR6). Each focus move shows one indicator (`architecture:interaction-modality` INV3): the image container draws the shared focus-visible outline for the open button. Implementation gap: both the open and the remove button keep their own focus ring inside the container outline, so focusing either draws two indicators (Current-state impact).                                                                                                                                                                                                                                                                                       | Current source and tests |
| FR5 | With `onRemove`, a small icon-only secondary Button named "Remove {name}" sits `--spacing-1` from the top and inline-end edges above the image, painted with the overlay scrim and on-dark icon; a click stops propagation before `onRemove`, so it never opens the thumbnail. With `showRemoveOn="hover"` the button is visually hidden at rest by opacity, stays in the tab order and accessibility tree, and is revealed on container hover, on focus within, and always on touch devices. While disabled, Remove stays mounted and inert, so a focused Remove keeps focus (`spec:AST-085` FR1, FR4).                                                                                                                                                                                                                                                                                                                              | Current source and tests |
| FR6 | `isDisabled` dims the root to half opacity with pointer events off. Its actions stay mounted, focusable, and announced as disabled (`spec:AST-085` FR1, FR4, FR5), and the disabled state is reflected on the owning target (`architecture:component-theming-surface` INV6). Implementation gap: the `thumbnail` target reflects no state (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests |
| FR7 | `ref` reaches the root. Supported DOM, ARIA, data, and event props reach the root; `data-testid` reaches the root; `xstyle`, `className`, and `style` merge in that order after component styles. A caller `aria-label` or `aria-labelledby` names the group (FR3). The group role is component-owned semantics (`architecture:public-component-api` INV5). Implementation gap: caller props spread after the role, so a caller `role` replaces it (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Current source and tests |

### Allowed variation

- **AV1 — Theme paint.** A theme may restyle `thumbnail` without changing its
  states, names, or action placement.
- **AV2 — Image content.** Image dimensions vary; the image always covers the
  square.

### Representative states

| State                | Required invariant                                                                                                                                    | Allowed variation |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Image, named         | Group named from `label` and `alt`; image exposed with its `alt`.                                                                                     | —                 |
| Image without alt    | Image `alt=""`, `role="presentation"`, `aria-hidden`.                                                                                                 | —                 |
| Placeholder or error | Placeholder glyph; a new `src` retries.                                                                                                               | —                 |
| Loading, no src      | Skeleton; an Open action stays mounted and inert.                                                                                                     | —                 |
| Uploading            | The image, or the placeholder if it failed, under the scrim with a hidden Spinner; busy start announced once; an Open action stays mounted and inert. | —                 |
| Openable             | "Open {name}" button; focus outline on the container (the button's own ring is the FR4 gap).                                                          | —                 |
| Removable, hover     | "Remove {name}" in the tab order, revealed on hover, focus, and touch.                                                                                | —                 |
| Disabled             | Half opacity; Open and Remove stay mounted, focusable, and inert.                                                                                     | —                 |

### Transformation and precedence order

- **ORD1 — Visual state.** Loading without `src` → loading with `src` (the
  image, or the placeholder if it failed, under the upload scrim) → image →
  placeholder (no `src` or load error).
- **ORD2 — Name.** "{label} — {alt}" → `label` → `alt` → "Thumbnail"; a caller
  `aria-label` replaces it on the group.
- **ORD3 — Remove click.** Stop propagation → `onRemove`.

### Performance and resources

- **PR1 — CSS reveal and shared press.** The hover reveal is CSS-only. Every
  Thumbnail installs the shared document-level press controller on mount, and
  only an interactive one carries its press marker; the uploading state
  announces through the shared busy-announcement channel. Thumbnail adds no
  listener, observer, or timer of its own.

## Accessibility contract

- **AR1 — Group name.** The root is a named group, never a roleless element
  with a name, so the open and remove buttons inside it stay reachable.
  Implementation gap: a caller `role` replaces the group role (FR7).
- **AR2 — Image alternative.** An image with `alt` is exposed with it; without
  `alt` it is explicitly decorative.
- **AR3 — Busy state.** The upload Spinner is hidden from assistive technology;
  Thumbnail announces "Loading" once per busy start through the shared channel,
  as `spec:AST-086` FR8 requires of a busy owner.
- **AR4 — Remove target.** The remove target is at least 24 by 24 CSS pixels
  for every pointer (WCAG 2.2 2.5.8). The button is 20 by 20, with a hit area
  extended 2px on every side on coarse pointers. Implementation gap: on a fine
  pointer the target stays 20 by 20.
- **AR5 — Disabled and loading.** A disabled thumbnail's actions stay mounted,
  focusable, and announced as disabled, and a loading thumbnail's Open stays
  mounted and inert, so focus never moves when either state starts
  (`spec:AST-085` FR1, FR4, FR5, FR6).
- **AR6 — Reachable remove.** A hover-revealed remove button is never removed
  from the tab order and appears on keyboard focus and on touch devices.

## Design relationships

| Anatomy or state | Design requirement                                                 | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------------ | ------------------------ | -------------- | ------------------ |
| Image            | The preview image as a cover-fitted square.                        | Current source and docs  | Prominent      | FR1, FR2, AR2      |
| Placeholder      | An image silhouette when there is no image.                        | Current source and docs  | Supporting     | FR2                |
| Remove button    | An overlaid close control on a fixed scrim legible over any image. | Current source and docs  | Supporting     | FR5, AR4, AR6      |
| Upload overlay   | A scrim with a spinner while an image uploads.                     | Current source and docs  | Supporting     | FR2, AR3           |
| Skeleton         | A shimmer while loading without an image.                          | Current source and docs  | Supporting     | FR2                |

Theming: the root is the single `thumbnail` target; the parts add no targets.
The consumer anatomy names no root part, so no anatomy-theming block is
declared.

## Family and system relationships

- `spec:AST-085` owns focusable disabled controls; AR5 records how Thumbnail applies it.
- `spec:AST-086` owns busy announcements; AR3 records Thumbnail's conformance.
- `architecture:internationalization` owns the catalog behind the fallback
  name and the open and remove names.
- `architecture:public-component-api` owns ref, passthrough, and styling-input
  rules; FR7 applies them to the root.

## Verification map

| Contract            | Verification                                                                  | Representative states                                              | Mutation or failure expectation                                                                                                                                                                                                                                                                                                 | Audit section              |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| FR1                 | `Thumbnail.stories.tsx` in a browser                                          | Every state                                                        | Gap: no test asserts the root width, layout, or the image container's shape, clipping, or paint; they are visible only in the rendered fixture.                                                                                                                                                                                 | `audit:Thumbnail/layout`   |
| FR2, ORD1           | `Thumbnail.test.tsx` state, error, and retry tests                            | Image, placeholder, skeleton, uploading, failed, changed `src`     | A wrong element for any state, a failed image left showing, or a changed `src` not retried fails. Gap: a failed `src` while uploading, the scrim and placeholder paint and the Spinner's size and shade have no automated check; the cover fit and inset border appear only in the static-image visual baseline.                | `audit:Thumbnail/behavior` |
| FR3, ORD2, AR1, AR2 | `Thumbnail.test.tsx` naming, role, image, warning, and tooltip tests          | Label, label with alt, alt, neither                                | A missing label or joined name, a missing `group` role, an exposed decorative image, a lost `alt`, a missing or repeated warning, or the label rendered inline fails. Gap: no test asserts the alt-only or default "Thumbnail" name, a caller `aria-label` or `aria-labelledby`, the label description, or the tooltip opening. | `audit:Thumbnail/a11y`     |
| FR4                 | `Thumbnail.test.tsx` naming, click, loading, disabled, and touch-press tests  | Openable, loading, disabled                                        | A wrong "Open …" name, a lost callback, or a missing touch-press overlay fails. The loading and disabled tests fail if Open unmounts, calls `onClick`, or loses focus or its disabled state. Gap: the full-size button, the hover overlay, and the focus indicators have no automated check.                                    | `audit:Thumbnail/behavior` |
| FR5, ORD3, AR6      | `Thumbnail.test.tsx` remove and `showRemoveOn` suites                         | Hover, always, default reveal                                      | A lost `onRemove`, a hover-revealed button missing from the DOM, or the same reveal treatment for both values fails. A wrong "Remove …" name also fails. Gap: that a remove click never calls `onClick`, the button's position and paint, and the reveal triggers have no automated check.                                      | `audit:Thumbnail/a11y`     |
| FR6, AR5            | `Thumbnail.test.tsx` disabled tests                                           | Disabled with actions                                              | The tests fail if a disabled Open or Remove unmounts, loses focus, drops `aria-disabled`, or calls its callback. Gap: the half opacity and pointer-events rule have no automated check.                                                                                                                                         | `audit:Thumbnail/a11y`     |
| FR7                 | `Thumbnail.test.tsx` ref and test-id tests                                    | Root                                                               | A lost ref or `data-testid` fails. Gap: no test covers DOM passthrough, attribute order, or the styling-input merge.                                                                                                                                                                                                            | `audit:Thumbnail/api`      |
| AR3                 | `Thumbnail.test.tsx` uploading test; source review against `spec:AST-086` FR8 | Uploading                                                          | An exposed upload Spinner fails. Gap: no automated check fails if the busy state is announced twice.                                                                                                                                                                                                                            | `audit:Thumbnail/a11y`     |
| AR4                 | `Thumbnail.stories.tsx` in a browser at fine and coarse pointers              | Removable                                                          | Gap: no automated target-size check; the fine-pointer size is the recorded gap.                                                                                                                                                                                                                                                 | `audit:Thumbnail/a11y`     |
| PR1                 | Source review                                                                 | Removable, openable, uploading                                     | Gap: no automated check fails if Thumbnail adds its own listener, observer, or timer.                                                                                                                                                                                                                                           | `audit:Thumbnail/behavior` |
| AR1, AR2            | Accessibility-tree evidence (`spec:AST-009` FR3)                              | Named group, open and remove buttons, image with and without `alt` | Gap: no accessibility-tree check proves the group name, button names, or image exposure; the unit tests query the DOM.                                                                                                                                                                                                          | `audit:Thumbnail/a11y`     |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
