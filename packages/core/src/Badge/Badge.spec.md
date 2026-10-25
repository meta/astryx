---
schema_version: 3
template_version: 7
kind: component
id: component:Badge
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Badge/Badge.test.tsx,
    packages/core/src/serverSafeComponents.test.ts,
    packages/core/src/theme/themingTargets.test.ts,
    packages/core/src/theme/extensibleAxes.test.ts,
    apps/storybook/stories/Badge.stories.tsx,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: []
---

# Badge component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A read-only, one-line label with a required `label`, an optional leading `icon`, and a theme-extensible `variant` (default `neutral`).                                                            |
| Behavior                | The badge never wraps; a label wider than the available space is cut with an ellipsis inside the badge, and a string or number label is also carried in the root's `title`.                       |
| End-user impact         | Readers see a compact status or category label that stays inside its container; assistive technology reads the full label text.                                                                   |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                                      |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. One implementation gap is listed under Current-state impact.                                                           |
| Review checks           | Reject a badge that wraps or escapes its container, a `title` derived from a rich label, a badge that adds its own role, tab stop, or live region, or a variant that is not reflected on `badge`. |
| Governing rules         | `architecture:public-component-api/INV5,INV6,INV8`; `architecture:component-theming-surface/INV2,INV6,INV14`.                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

Badge marks one status or category with a short, non-interactive label. It owns
the label's one-line geometry, its overflow treatment, and the closed set of
built-in tones that a theme can extend.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes
- Controlled/uncontrolled behavior: not applicable; Badge holds no state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Clipped label tail is pointer-only (AR4).** Keyboard and touch users cannot
  reveal the clipped tail of a long label; only a pointer hover on the native
  `title` shows it. Assistive technology still receives the full text from the
  DOM.

## Ownership boundary

**Owns**

- The badge root, its optional leading Icon slot, and the Label container.
- One-line geometry, inline padding, radius, typography, and the ellipsis
  overflow treatment.
- The built-in `variant` tones and the reflection of `variant` on the `badge`
  theming target.
- Deriving the root `title` from a string or number label.

**Does not own / non-goals**

- Which status or category a product shows, its wording, and whether a badge is
  appropriate — owned by the product callsite and consumer guidance in
  `Badge.doc.mjs`.
- The supplied icon's artwork, size, and accessibility exposure — owned by the
  supplied node (`component:Icon` when an Icon is passed).
- Tag-like and dot-only status presentations — owned by
  `component:Token` and `component:StatusDot`.
- Contrast of the color tokens each tone uses — owned by the active theme.

## Public concepts

| Concept          | Closed values or states                                                                                                                                          | Meaning                                               | Availability by variant/orientation/state | Default   | Owner             | Stability | Invalid-value behavior                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------- | --------- | ----------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Tone (`variant`) | Semantic: `neutral`, `info`, `success`, `warning`, `error`; color: `blue`, `cyan`, `green`, `orange`, `pink`, `purple`, `red`, `teal`, `yellow`; theme additions | Selects the badge fill and text color.                | All badges                                | `neutral` | `component:Badge` | Stable    | A theme-added value is reflected on `badge` and receives no component fill or color (FR6); TypeScript rejects unregistered values. |
| Label            | string, number, or rich node                                                                                                                                     | The visible badge content.                            | Always rendered; required                 | Required  | `component:Badge` | Stable    | An empty string renders an empty label and no `title`.                                                                             |
| Icon             | present; absent                                                                                                                                                  | Optional caller-supplied node shown before the label. | All badges                                | absent    | `component:Badge` | Stable    | Absent renders no icon and no placeholder.                                                                                         |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                        | Basis                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| FR1 | Badge renders one inline-flex `span` root, centered on both axes, with block size `--spacing-5` (at least that size once it grows with a set text size under `spec:AST-102` FR4; today's fixed size is a gap), no block padding, inline padding `--spacing-2`, `--radius-full` corners, inherited font family, `--text-supporting-size` and `--text-supporting-leading` type, and `--font-weight-medium` weight. | Current source                          |
| FR2 | When `icon` is supplied it renders directly inside the root, before the Label container, separated by `--spacing-1`; the label always renders inside its own Label container.                                                                                                                                                                                                                                    | Current source and tests                |
| FR3 | The badge is one line and never wraps. The root is capped at the inline size of its container and may shrink below its content size; a label that does not fit is clipped with a trailing ellipsis inside the Label container and does not escape the badge.                                                                                                                                                     | Current source and consumer docs        |
| FR4 | A non-empty string label or any number label sets the root `title` to the label text, whether or not the label is clipped. A rich-node or empty-string label sets no `title`.                                                                                                                                                                                                                                    | Current source and tests                |
| FR5 | `variant` defaults to `neutral`. `neutral` paints `--color-neutral` with primary text; `info`, `success`, `warning`, and `error` paint the solid accent, success, warning, and error colors with their matching on-color text; each color variant paints its tinted background with its matching colored text.                                                                                                   | Current source and consumer docs        |
| FR6 | The `badge` target carries the resolved `variant` for every value, including a value a theme adds through `BadgeVariantMap`. A theme-added value receives no component fill or text color, so it renders the FR1 geometry over a transparent background in the inherited text color until a theme paints it.                                                                                                     | Current source and extensible-axis test |
| FR7 | `ref` reaches the root `span`. Supported DOM, ARIA, data, and event props reach the root; `xstyle`, `className`, and `style` merge in that order after the component styles.                                                                                                                                                                                                                                     | Current source and tests                |
| FR8 | Badge uses no hooks, measurement, or client-only API, so it renders identically on the server and the client.                                                                                                                                                                                                                                                                                                    | Current source and server-safety test   |

### Allowed variation

- **AV1 — Theme paint.** A theme may change any visual property of `badge`,
  including per-`variant` fill, text color, height, and radius, without changing
  anatomy, the one-line rule, or the `title` rule.
- **AV2 — Label content.** Label length and content may vary; clipping position
  depends on the available inline size.

### Representative states

| State               | Required invariant                                                        | Allowed variation                |
| ------------------- | ------------------------------------------------------------------------- | -------------------------------- |
| Default             | Neutral tone, one line, `title` equal to the string label.                | Label text.                      |
| With icon           | Icon renders before the Label container on the inline-start side.         | Icon artwork and size.           |
| Count               | A number label renders as text and sets `title` to its string form.       | Tone.                            |
| Long label, narrow  | The badge stays within its container and the label ends in an ellipsis.   | Clip position.                   |
| Rich label          | The node renders inside the Label container and no `title` is set.        | Node content.                    |
| Theme-added variant | `data-variant` names the added value; no component fill or color applies. | Theme paint for the added value. |

### Transformation and precedence order

- **ORD1 — Root attributes.** Component class and `data-variant` → component
  styles → `xstyle` → `className` → `style` → derived `title` → remaining
  caller props.
- **ORD2 — Content order.** Icon, then Label container, in logical inline
  order.

### Performance and resources

- **PR1 — Static render.** Badge registers no listener, observer, timer, or
  effect and performs no layout measurement.

## Accessibility contract

- **AR1 — Static text.** Badge adds no role, tab stop, or live region of its
  own and exposes its label as ordinary text in reading order, so a changed
  label is not announced. A caller `role` or `tabIndex` passes through (FR7).
- **AR2 — Meaning in text.** Badge renders `label` as text, and tone color
  supplements that text. An empty label renders a color-only badge with nothing
  in the accessibility tree; supplying a meaningful label is the callsite's
  responsibility.
- **AR3 — Icon exposure is delegated.** Badge adds no name, role, or
  `aria-hidden` to the supplied icon; its exposure is the supplied node's own
  (an Icon without a label is decorative under `component:Icon`).
- **AR4 — Full text stays in the DOM.** Clipping is visual only: the complete
  label remains in the accessibility tree, and the FR4 `title` exposes it to
  pointer hover. Implementation gap: keyboard and touch users have no way to
  reveal a clipped tail.

## Design relationships

| Anatomy or state | Design requirement                                             | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Badge root       | A compact one-line pill whose tone signals status or category. | Current source           | Supporting     | FR1, FR3, FR5, FR6 |
| Icon             | An optional leading glyph that helps identify the badge type.  | Current source and docs  | Supporting     | FR2, AR3           |
| Label            | The text or number that carries the badge's meaning.           | Current source and docs  | Prominent      | FR3, FR4, AR2, AR4 |

Theming: the root is the single `badge` target and reflects `variant`. The Label
container and the Icon slot add no targets: the label inherits `badge`, and a
supplied icon keeps its own styling and inherits the badge text color.

## Family and system relationships

- `architecture:public-component-api` owns ref, passthrough, and styling-input
  rules; FR7 applies them to the root `span`.
- `architecture:component-theming-surface` owns target qualification, state
  reflection, and extensible-axis rules; FR6 records Badge's extensible
  `variant` axis and its unthemed fallback.

## Verification map

| Contract | Verification                                                                                  | Representative states                                  | Mutation or failure expectation                                                                                                                                                                             | Audit section          |
| -------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| FR2, FR7 | `Badge.test.tsx`                                                                              | Icon, ref, passthrough                                 | Dropping the icon, the ref, or a passthrough prop fails DOM assertions. Gap: the icon-before-label order is untested.                                                                                       | `audit:Badge/behavior` |
| AR1–AR3  | Source review                                                                                 | Default, with icon                                     | Gap: no automated check fails if Badge adds its own role, tab stop, live region, or icon semantics.                                                                                                         | `audit:Badge/a11y`     |
| FR5      | `Badge.test.tsx` `data-variant` assertions; `Badge.stories.tsx` variant fixtures in a browser | `success` and `purple` reflection; every tone rendered | A lost `data-variant` for those tones fails. Gap: no automated check covers the `neutral` default's reflection or any tone's paint; a paint change is visible only in the rendered fixtures.                | `audit:Badge/theming`  |
| FR4, AR4 | `Badge.test.tsx` full-label suite                                                             | String, number, rich, and empty labels                 | Setting `title` from a rich or empty label, or dropping it for a string or number, fails. Gap: no check asserts that a clipped label stays whole in the accessibility tree.                                 | `audit:Badge/a11y`     |
| FR1, FR3 | `Badge.stories.tsx` long-label fixture in a browser                                           | Long labels in tight space                             | A label that wraps or escapes the badge is visible in the rendered fixture.                                                                                                                                 | `audit:Badge/layout`   |
| FR6      | `extensibleAxes.test.ts`, `themingTargets.test.ts`                                            | `BadgeVariantMap`, `badge` target                      | Removing `variant` from the target reflection or the doc's `visualProps` fails the structural checks. Gap: no test renders a theme-added value, so the unthemed fallback is verified by source review only. | `audit:Badge/theming`  |
| FR8, PR1 | `serverSafeComponents.test.ts`                                                                | Import graph                                           | Adding a hook or a client-only import to Badge fails the server-safety invariant.                                                                                                                           | `audit:Badge/behavior` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

- **OQ1 — How should the full text of a clipped label reach keyboard and touch
  users?** (`human-design`) Options include a measured tooltip shown only when
  the label is clipped, which makes Badge a client component and focusable
  while clipped, or leaving recovery to the callsite.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
