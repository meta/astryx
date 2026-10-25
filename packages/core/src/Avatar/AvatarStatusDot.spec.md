---
schema_version: 3
template_version: 7
kind: component
id: component:AvatarStatusDot
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Avatar/AvatarStatusDot.test.tsx,
    packages/core/src/Avatar/Avatar.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    packages/core/src/theme/extensibleAxes.test.ts,
    apps/storybook/stories/AvatarStatusDot.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:component-style-authoring,
    architecture:public-component-api,
    architecture:theme-tokens,
  ]
contributing: []
system_specs: [spec:AST-002, spec:AST-009, spec:AST-038]
---

# AvatarStatusDot component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A status dot for Avatar's `status` slot with `variant` (default `success`), optional `label`, and optional `icon`.                              |
| Behavior                | The dot sizes itself from the owning Avatar in three tiers, pairs each built-in variant with a distinct shape, and reports its label to Avatar. |
| End-user impact         | Screen-reader users hear the status in the avatar's name; sighted users can tell statuses apart by shape as well as color.                      |
| Builder impact          | None; the record describes shipped behavior.                                                                                                    |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. Two implementation gaps are listed under Current-state impact.       |
| Review checks           | Reject a built-in variant that differs only by color, an exposed glyph or icon, or a label that stops reaching the owning Avatar.               |
| Governing rules         | `architecture:component-theming-surface/INV2,INV6,INV14`; `architecture:public-component-api/INV5,INV6,INV8`; WCAG 2.2 1.4.1.                   |

This table is a review projection; the body below is authoritative.

## Intent

AvatarStatusDot renders the compact status indicator composed through Avatar's
`status` slot. It owns the dot's size tiers, its built-in non-color marks, and
reporting its label into the owning Avatar's accessible name.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Augmented variant without a fallback (FR6).** `AvatarStatusDotVariantMap`
  admits theme-added names, but a name with no built-in rule renders the dot's
  geometry and `data-variant` with no fill, ink, or glyph. A caller `icon` with
  a `style` color covers the medium and large tiers, but the small tier drops
  the icon, and nothing paints a theme-independent baseline.
  `architecture:component-theming-surface` INV14 requires an extensible visual
  axis to have a safe theme-independent baseline.
- **Base status tokens (FR2).** `architecture:theme-tokens` INV11 has
  components choose the surface-specific status role; the `success` and `error`
  plates paint the base `--color-success` and `--color-error` tokens.

## Ownership boundary

**Owns**

- The painted status-dot root and its `avatar-status-dot` target.
- The built-in filled, ring, and minus visual branches and the
  `avatar-status-dot-glyph` target.
- Size-tier resolution from Avatar's resolved numeric size.
- Reporting its optional status label into Avatar's accessible name.

**Does not own / non-goals**

- Avatar identity, image fallback, shape, status placement, or interactive behavior
  — owned by `component:Avatar`.
- The meaning or artwork of caller-supplied icon content.

## Public concepts

Consumer syntax remains in `AvatarStatusDot.doc.mjs`.

| Concept        | Closed values or states                                                               | Meaning                                                             | Availability by variant/orientation/state | Default               | Owner                                                               | Stability | Invalid-value behavior                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- | --------------------- | ------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Status variant | Built-ins `success`, `neutral`, `error`; the released map also admits augmented names | Selects the plate color and built-in non-color mark.                | All size tiers; LTR and RTL.              | `success`             | `component:AvatarStatusDot`                                         | Stable    | An augmented name is reflected as `data-variant` and keeps a safe theme-independent baseline (FR6); today it has none, the FR6 gap. |
| Status label   | String or absent                                                                      | Names a standalone dot and is reported into the owning Avatar name. | Every variant and size.                   | Absent                | Caller supplies meaning; component exposes and reports it           | Stable    | Empty or absent label emits no role or accessible name on the dot and reports no status name.                                       |
| Custom icon    | Renderable React content or absent                                                    | Replaces the built-in glyph where the size tier has room.           | Medium and large tiers; hidden on small.  | Absent                | Caller owns artwork; component owns placement and suppression rules | Stable    | Booleans and empty strings are ignored; a component that renders no DOM still suppresses the built-in glyph.                        |
| DOM extension  | Supported BaseProps inputs and ref                                                    | Extends the root and combines consumer styles.                      | Every render branch.                      | No additional inputs. | `architecture:public-component-api`                                 | Stable    | BaseProps omissions remain unsupported.                                                                                             |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Basis                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| FR1 | Avatar sizes up to 36px resolve a 10px dot with a 1px border and no custom icon; 40–72px resolve a 20px dot, 2px border, and 12px icon; 96px and above resolve a 32px dot, 4px border, and 18px icon. The border is the surface color. Outside an Avatar in the same layer (`spec:AST-038` FR7, FR8) the dot uses the 36px tier.                                                                                                                                                                                                                                   | Current source, tests, and stories                                                     |
| FR2 | `success` paints a filled `--color-success` plate with no inner glyph; `neutral` paints a surface plate with a ring in secondary text color; `error` paints a `--color-error` plate with a minus bar in the surface color. Glyphs are stroked in `currentColor` at 1, 1.5, or 2px by tier; the minus spans 75% of the inner field with round caps. Status fills use the surface-specific status roles (`architecture:theme-tokens` INV11). Implementation gap: the `success` and `error` plates use the base status tokens (Current-state impact).                 | Current source, tests, and consumer docs                                               |
| FR3 | At medium and large tiers, renderable `icon` content replaces the built-in glyph and is centered in an assistive-technology-hidden wrapper sized to the tier's icon size. At the small tier the icon is omitted and the built-in glyph remains. Booleans and empty strings are not renderable.                                                                                                                                                                                                                                                                     | Current source and tests                                                               |
| FR4 | A non-empty `label` adds `role="img"` and `aria-label` to the dot. The dot reports the same label to the owning Avatar before paint, at any wrapper depth, and withdraws it when it unmounts.                                                                                                                                                                                                                                                                                                                                                                      | Current source and Avatar integration tests                                            |
| FR5 | The root carries `avatar-status-dot` with `variant`; ring and minus SVGs carry `avatar-status-dot-glyph` with `shape`. Supported consumer props and ref reach the root; the dot's own role, name, and styling apply after caller props, and `xstyle`, `className`, and `style` merge in that order.                                                                                                                                                                                                                                                                | Current source, docs, and target tests                                                 |
| FR6 | The released `AvatarStatusDotVariantMap` admits augmented names, and an extensible visual axis has a safe theme-independent baseline (`architecture:component-theming-surface` INV14). For an unmatched name, root geometry and reflected `data-variant` remain while built-in fill, ink, and glyph are absent; at the medium and large tiers a caller `icon` with a `style` color supplies a color and a mark, and at the small tier the icon is not rendered. Implementation gap: no theme-independent baseline paints an unmatched name (Current-state impact). | Current source, docs, focused test, and `architecture:component-theming-surface/INV14` |

### Allowed variation

- **AV1 — Identity and meaning.** The status label and caller icon artwork may vary.
- **AV2 — Theme output.** Targets and reflected axes may vary through the public
  theming system without moving target ownership.
- **AV3 — Consumer styling.** Supported BaseProps inputs may vary on the root
  while component-owned size and reporting behavior remain.

### Representative states

| State                  | Required invariant                                                                                     | Allowed variation                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Built-in variants      | Fill, ring, and minus branches and reflected `variant` remain.                                         | Label, Avatar content, size, theme, and direction may vary. |
| Small tier             | Dot and built-in shape remain; custom icon is omitted.                                                 | Built-in variant and label may vary.                        |
| Medium and large tiers | Tier dimensions apply; renderable custom icon replaces the glyph.                                      | Icon artwork, variant, label, and theme may vary.           |
| Labelled               | Dot exposes its label and reports it to Avatar.                                                        | The caller-authored label may vary.                         |
| Unlabelled             | Dot has no role or name and reports no status label.                                                   | Visual variant and icon may still render.                   |
| Augmented variant      | Root geometry and reflected `data-variant` render; built-in fill, ink, and glyph are absent (FR6 gap). | A theme may paint the added name.                           |
| RTL                    | Dot content is direction-neutral; Avatar owns logical corner placement.                                | Theme, variant, size, label, and icon may vary.             |

### Transformation and precedence order

- **ORD1 — Resolve size.** Take the owning Avatar's resolved size (36px outside
  an Avatar in the same layer), then select the discrete size tier and dimensions.
- **ORD2 — Resolve mark.** A renderable icon wins when the tier permits it;
  otherwise the built-in variant glyph is selected when one exists.
- **ORD3 — Resolve root.** Caller props → role and name → component target and
  styles → `xstyle` → `className` → `style`.

### Performance and resources

- **PR1 — Reporting without re-rendering.** Reporting or withdrawing the label
  causes no extra render of the dot or the avatar and leaves no listener,
  observer, or timer behind.

## Accessibility contract

- **AR1 — Accessible name.** A non-empty `label` names a standalone dot and is
  composed into the owning Avatar's name.
- **AR2 — Decorative visual marks.** The built-in SVG and custom-icon wrapper are
  hidden from assistive technology because the root or Avatar name carries status.
- **AR3 — Built-in non-color cues.** The three built-in variants use filled,
  ring, and minus topologies in addition to semantic color (WCAG 2.2 1.4.1). A
  caller icon replaces that mark at medium and large tiers, so the non-color
  distinction then depends on the caller using a different icon per status.

## Design relationships

| Anatomy or state | Design requirement                                             | Representation authority                                             | Hierarchy role             | Component contract |
| ---------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------- | ------------------ |
| Status-dot root  | Compact semantic-status plate on Avatar's edge.                | Current source and consumer docs; no current component design record | Supporting indicator       | FR1, FR2, FR5      |
| Built-in glyph   | Ring or minus supplements color for neutral/error.             | WCAG 2.2 SC 1.4.1 plus current shipped representation                | Meaningful non-text cue    | FR2, AR3           |
| Custom icon      | Caller artwork replaces the built-in mark where space permits. | Caller owns artwork; current source owns placement                   | Conditional meaningful cue | FR3, AR2, AR3      |

## Family and system relationships

- `architecture:component-theming-surface` owns painting-target qualification,
  reflected axes, and the reliable theme-independent fallback required for an
  extensible visual axis; FR6 records the gap against it.
- `architecture:component-style-authoring` owns StyleX lowering and permits the
  component-owned non-glyph SVG shapes used here.
- `architecture:public-component-api` owns the released subpath, BaseProps
  passthrough, styling composition, ref reachability, and compatibility boundary.
- `architecture:theme-tokens` owns the semantic color and radius vocabulary.
- `spec:AST-002` owns API admission and requires future public behavior or default
  changes to identify current authority.

## Verification map

| Contract          | Verification                                                              | Representative states                                                | Mutation or failure expectation                                                                                                                                        | Audit section                         |
| ----------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| FR1–FR3, AR2, AR3 | `AvatarStatusDot.test.tsx` and `AvatarStatusDot.stories.tsx` in a browser | Three size tiers, three built-ins, custom icon present/absent        | Size-tier, mark-selection, hidden-icon, or built-in-shape drift fails focused assertions or the rendered fixture.                                                      | `audit:AvatarStatusDot/behavior`      |
| FR4, AR1          | `Avatar.test.tsx` status-name suites and `AvatarStatusDot.test.tsx`       | Direct/wrapped/changing/removed labels; labelled and unlabelled dots | Losing the standalone or composed status name, commit-phase update, or cleanup fails role/name assertions.                                                             | `audit:AvatarStatusDot/accessibility` |
| FR5               | `themingTargets.test.ts` and `extensibleAxes.test.ts`                     | Built-in and augmented variants, glyph ring/minus                    | Missing target metadata or axis wiring fails the structural checks. Gap: no test renders the dot to check that consumer props, ref, and styling inputs reach the root. | `audit:AvatarStatusDot/theming`       |
| FR6               | `AvatarStatusDot.test.tsx` augmented-variant test                         | Augmented name without a matching built-in rule                      | A glyph appearing for an unmatched name fails. Gap: a fill appearing, and the caller `icon` path, have no automated check.                                             | `audit:AvatarStatusDot/api`           |
| RTL relation      | `AvatarStatusDot.stories.tsx` in a browser in both directions             | Built-ins across all size tiers                                      | New directional glyph, physical positioning, or unmatched transform is visible in the rendered fixture.                                                                | `audit:AvatarStatusDot/i18n-rtl`      |
| Record structure  | `scripts/check-knowledge.mjs`                                             | This record                                                          | Missing required structure or relationships fails repository validation.                                                                                               | `audit:AvatarStatusDot/docs`          |
| PR1               | `Avatar.test.tsx` no-extra-render test                                    | Wrapped status label                                                 | An extra render or a reporting loop fails.                                                                                                                             | `audit:AvatarStatusDot/behavior`      |
| AR1, AR2          | Accessibility-tree evidence (`spec:AST-009` FR3)                          | Labelled and unlabelled standalone dots                              | Gap: no accessibility-tree check proves the standalone image role and name or the hidden marks; the unit tests query the DOM.                                          | `audit:AvatarStatusDot/accessibility` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer examples, current audit scores, screenshots,
run inventories, eligibility data, or shared API/theming rules. It links to their
owners.
