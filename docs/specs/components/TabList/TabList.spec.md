---
schema_version: 3
template_version: 5
kind: component
id: component:TabList
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-21
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, accessibility]
verified_by:
  [
    packages/core/src/TabList/TabList.test.tsx,
    apps/storybook/stories/TabList.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:container-padding, architecture:public-component-api]
contributing: [contributing:api-conventions]
system_specs: [spec:AST-002/DEC-1, spec:AST-002/DEC-2, spec:AST-017/DEC-1]
---

# TabList component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Canonicalize the existing mode as `edge?: 'padded' \| 'bleed'` (default `'padded'`) from the shared `edge` vocabulary; deprecate `isFullBleed` as an alias of `edge="bleed"` and remove it in the next minor release.                                                              |
| Behavior                | Move first and last visible tab content toward the host content line, reaching it when the host inset is at least the edge-tab padding, while preserving tab interaction padding, focus-ring room, overflow controls, selection-indicator geometry, and the optional divider rail. |
| End-user impact         | Edge tabs lose unnecessary extra inset where host geometry permits and remain fully interactive without clipped focus, selection, overflow, or divider treatment.                                                                                                                  |
| Builder impact          | Existing `isFullBleed` callsites keep working during the deprecation window and migrate mechanically to `edge="bleed"`.                                                                                                                                                            |
| Compatibility/readiness | Current behavior is shipped; the canonical alias is additive, while removing the released legacy prop is a separately implemented breaking change in the next minor release.                                                                                                       |
| Review checks           | Reject a behavior change disguised as a rename, directional values without overflow/indicator proof, or early removal of the legacy prop.                                                                                                                                          |
| Governing rules         | `architecture:container-padding/INV9–INV11`; `spec:AST-002/DEC-1–DEC-2`; `spec:AST-017/DEC-1`.                                                                                                                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

TabList's current opt-in is the shared `bleed` edge treatment: it consumes the
full inherited host inset, moves visible edge-tab content toward the surrounding content line,
and retains Tab-owned interaction padding plus TabList-owned divider, overflow,
and indicator geometry. Content reaches the host line only when that inset is at
least the edge tab's own padding. The public `isFullBleed` name is misleading
because the strip keeps a content line: it restores uncovered content inset
after the outer box expands, which `architecture:container-padding` names `bleed`.

## Compatibility and migration

- Released default preserved: `yes`; omission keeps current TabList geometry.
- Compatibility class: the canonical alias is additive while the released
  `isFullBleed` prop remains; removing that prop is a breaking change in the next
  minor release under `spec:AST-017/DEC-1`.
- Controlled/uncontrolled behavior: active-value control is unchanged.
- Migration decision: `component:TabList/DEC-1`.

During the compatibility window:

- `edge="bleed"` is the canonical spelling, and omitted `edge` means `padded`;
- omitted `edge` plus `isFullBleed={true}` selects `bleed`;
- `isFullBleed` is deprecated and maintained examples use the canonical prop;
- if both props are supplied, explicit `edge` is canonical and the legacy
  boolean cannot override it.

The removal release MUST include a `[breaking]` Changeset for
`@astryxdesign/core`, consumer release notes, and an `astryx upgrade` codemod that rewrites
`isFullBleed` to `edge="bleed"`.

## Ownership boundary

**Owns**

- The TabList-wide `bleed` edge treatment and its compatibility alias.
- The relationship between the outer TabList box, inner strip padding, edge tabs,
  focus-ring room, overflow controls, and selection indicator.
- Which logical edges are supported by the public mode.

**Does not own / non-goals**

- Host padding publication, nesting, or overlay resets — owned by
  `architecture:container-padding`.
- Button or List edge projections.
- The `flush` or `outset` values, or per-edge application, without separate
  proof and owner approval.
- A change to navigation/tab semantics, selection state, keyboard behavior, or
  overflow ownership.

## Public concepts

| Concept        | Closed values or states    | Meaning                                                                                                                                                                                           | Availability by variant/orientation/state                          | Default            | Owner               | Stability                       | Invalid-value behavior                       |
| -------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------ | ------------------- | ------------------------------- | -------------------------------------------- |
| Edge treatment | omitted, `padded`, `bleed` | `bleed`: consume both inherited inline host insets and move edge-tab content toward the host lines while retaining local interaction and strip-owned geometry; `padded`: current default geometry | Navigation and tabs patterns across current layout/overflow states | omitted (`padded`) | `component:TabList` | accepted; canonical API pending | Other values are rejected by the public type |
| Legacy alias   | omitted, `false`, `true`   | Compatibility spelling for `padded` or `bleed`                                                                                                                                                    | Until the next minor release                                       | omitted/`false`    | `component:TabList` | deprecated                      | `true` maps to `bleed`; explicit `edge` wins |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                          | Basis                                                             | Status                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| FR1 | The current opt-in MUST remain the `bleed` treatment: the outer TabList box consumes the full inherited inline host inset and any `hasDivider` rail spans that expanded width; the inner strip restores `max(host inset - edge-tab padding, 0)` at each logical edge. Visible edge-tab content reaches the host line only when the host inset is at least the tab padding; otherwise it moves toward that line without crossing the host boundary. | Current source and `component:TabList/DEC-1`                      | Shipped behavior                                         |
| FR2 | Compensation MUST preserve Tab interaction padding, focus-ring room, overflow detection and controls, scroll access, selection-indicator geometry, and the optional divider rail's expanded inline span.                                                                                                                                                                                                                                           | Current source plus owner direction                               | Shipped behavior; expanded evidence required with rename |
| FR3 | `edge?: 'padded' \| 'bleed'` MUST become the canonical API, with `bleed` selecting FR1–FR2 geometry and `padded` the omitted default, without changing either.                                                                                                                                                                                                                                                                                     | `architecture:container-padding/INV10`; `component:TabList/DEC-1` | Accepted contract; implementation pending                |
| FR4 | During the deprecation window, omitted `edge` plus `isFullBleed={true}` MUST produce the canonical `bleed` behavior. Explicit `edge` MUST remain authoritative when both props are supplied.                                                                                                                                                                                                                                                       | Compatibility decision                                            | Accepted contract; implementation pending                |
| FR5 | `isFullBleed` MUST be removed in the next minor release only after maintained docs/examples use `edge`, both paths have compatibility evidence, and the removal includes a `[breaking]` Changeset plus an `astryx upgrade` codemod for mechanical consumer migration.                                                                                                                                                                              | `component:TabList/DEC-1`; `spec:AST-017/DEC-1`                   | Accepted contract; implementation pending                |
| FR6 | `flush`, `outset`, and per-edge application MUST remain rejected until overflow, clipping, scroll-control, focus-ring, indicator, direction, and theme-padding evidence receives owner approval.                                                                                                                                                                                                                                                   | Shared edge vocabulary and TabList boundary                       | Accepted boundary                                        |

### Allowed variation

- Layout, size, role, selected value, labels, tab content, and overflow mode may
  vary while the same `bleed` meaning is preserved.
- The implementation may retain the current outer-box/inner-strip technique or
  replace it with equivalent geometry that satisfies FR1–FR2.
- A host may be painted or bounded only where TabList's component-specific
  evidence proves the outer box, clipping, focus, and indicator behavior safe.

### Representative states

| State             | Required invariant                                                                                                       | Allowed variation                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Default/omitted   | Current TabList box, strip, and tab geometry are unchanged.                                                              | Any current layout, role, or overflow mode.                                                     |
| Canonical `bleed` | Outer box consumes each host inset; edge content reaches the host line only when that inset is at least the tab padding. | Host inset smaller than, equal to, or larger than edge-tab padding; asymmetric insets; LTR/RTL. |
| Divider           | `hasDivider` rail spans the expanded outer inline width.                                                                 | Fitting or overflowing strips.                                                                  |
| Legacy alias      | `isFullBleed={true}` matches canonical `bleed` geometry during the compatibility window.                                 | The canonical prop may also be present.                                                         |
| Overflowing strip | Scroll access, edge fades, controls, and selected-tab reveal remain correct.                                             | Start/end overflow independently.                                                               |
| Focused edge tab  | The focus ring remains visible and local to the tab.                                                                     | Keyboard or pointer focus.                                                                      |

### Transformation and precedence order

- **ORD1 — Public input.** Resolve explicit `edge`; otherwise map
  `isFullBleed={true}` to `bleed` during the compatibility window; otherwise use
  `padded`.
- **ORD2 — Host geometry.** Read the matching inherited logical host insets, with
  missing values falling back to zero.
- **ORD3 — Component geometry.** Resolve edge-tab padding and focus/indicator
  allowances from TabList-owned sources, restore the non-overlapping portion of
  each content inset, and preserve interaction padding and owned affordances.

### Performance and resources

- **PR1 — CSS-first geometry.** The rename MUST add no observer, listener,
  state, Effect, or render pass. Existing overflow measurement remains unchanged.

## Accessibility contract

- **AR1 — Interaction remains stable.** The `bleed` treatment MUST NOT change the
  tab/nav pattern, accessible names, selected state, keyboard movement, tab stop,
  focus target, or controlled value behavior.
- **AR2 — Overflow remains reachable.** `bleed` geometry MUST NOT clip or
  hide a focus ring, selected indicator, visible tab content, or an overflow
  control required to reach offscreen tabs.

## Design relationships

| Anatomy or state  | Design requirement                                                                                    | Representation authority  | Hierarchy role | Component contract |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ------------------------- | -------------- | ------------------ |
| Outer TabList box | Consumes the full inherited inline host inset; with `hasDivider`, its rail spans that expanded width. | `component:TabList/DEC-1` | Supporting     | FR1–FR3            |
| Inner strip       | Restores `max(host inset - edge-tab padding, 0)` and owns scrolling/fades.                            | Current TabList behavior  | Structural     | FR1–FR2            |
| Edge Tab          | Retains interaction padding and visible focus/selection treatment.                                    | Tab composition           | Prominent      | FR1–FR2, AR1–AR2   |

## Family and system relationships

- `architecture:container-padding` owns host publication, the shared `edge`
  vocabulary, logical-edge semantics, and overlay reset.
- `architecture:public-component-api` and `spec:AST-002` own public API
  admission; `spec:AST-017/DEC-1` owns the breaking classification and migration
  evidence required when the released alias is removed.
- TabList owns its specialized host, overflow, focus, and indicator projection.

## Verification map

| Contract         | Verification                                                                                                            | Representative states                                                                                                                           | Mutation or failure expectation                                                                            | Audit section          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------- |
| FR1–FR4          | `TabList.test.tsx` and type/docs tests                                                                                  | omitted, canonical, legacy, both props, and `hasDivider`                                                                                        | Alias drift, changed defaults, wrong precedence, or lost divider span fails                                | `audit:TabList/api`    |
| FR1–FR6, AR1–AR2 | Real-browser TabList geometry and interaction evidence                                                                  | LTR/RTL; host inset smaller/equal/larger than edge-tab padding; asymmetric/zero inset; divider; fitting/overflowing; selected/focused edge tabs | Wrong bounded movement, clipped focus/indicator/divider, inaccessible overflow, or scroll regression fails | `audit:TabList/visual` |
| FR5 and docs     | `TabList.doc.mjs`, Storybook, `[breaking]` Changeset, `astryx upgrade` codemod tests, and `scripts/check-knowledge.mjs` | canonical examples, deprecated alias, and removal migration                                                                                     | Missing migration guidance, wrong Changeset class, missing codemod rewrite, or stale canonical usage fails | `audit:TabList/docs`   |

## Decision log

### DEC-1 — TabList migrates from full-bleed wording to edge compensation

**Reference:** `component:TabList/DEC-1`

**Decider:** cixzhang, 2026-09-21

TabList's current mode consumes the full inherited inline host inset, keeps an
optional divider across that expanded width, and restores only the portion of
content inset not already supplied by edge-tab padding. The user-facing intent is
therefore edge compensation, not a promise that tab content itself reaches an
outer edge. DEC-2 sets the canonical spelling; `isFullBleed` remains a
compatibility alias until its `[breaking]` next-minor removal, with the required
codemod and release evidence.

### DEC-2 — TabList spells its mode with the shared edge vocabulary

**Reference:** `component:TabList/DEC-2`

**Decider:** cixzhang, 2026-10-16

`architecture:container-padding` names TabList's geometry `bleed`: paint reaches
the host's padding edge and content stays on the host content line, or at the
edge tab's own padding when the host inset is smaller. `edge="bleed"` is the
canonical spelling, so TabList and List share one prop name and one value set.

## Open questions

None.

## Content boundary

This claim-scoped contract does not duplicate TabList's complete navigation,
selection, overflow, or theming contract, consumer examples, implementation
steps, or List/Button projections. Those remain with their named owners.
