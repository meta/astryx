---
schema_version: 3
template_version: 4
kind: component
id: component:Collapsible
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-07
owners: [cixzhang, imdreamrunner]
review_triggers: [public-api, behavior, layout, accessibility, theming]
verified_by:
  [
    packages/core/src/Collapsible/Collapsible.test.tsx,
    packages/core/src/Collapsible/CollapsibleGroup.test.tsx,
    packages/core/src/Collapsible/__tests__/Collapsible.a11y.test.tsx,
    packages/core/src/Collapsible/__tests__/Collapsible.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:react-component-runtime,
    architecture:component-theming-surface,
  ]
contributing: [contributing:api-conventions]
system_specs: [spec:AST-002/DEC-1, spec:AST-020, spec:AST-021]
---

# Collapsible component contract

## Intent

Collapsible reveals and hides one content region from one disclosure trigger. Its
chevron communicates the same open state in two intentional layout patterns: a
trailing status indicator or a leading disclosure arrow aligned before a column of
labels.

The public axis is the chevron's logical position. Callers do not provide arbitrary
cue content or replace Collapsible's disclosure rendering.

## Compatibility and migration

- Released default preserved: yes. Omitting the new position keeps the current
  trailing chevron and current no-prop rendering.
- Compatibility class: additive optional public axis with a stable default.
- Controlled/uncontrolled behavior: unchanged.
- Migration decision: `component:Collapsible/DEC-1`.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- the disclosure trigger, its `aria-expanded` / `aria-controls` relationship, and
  the chevron that represents the open state;
- the `start | end` logical chevron-position axis;
- position-specific chevron direction in collapsed and expanded states;
- group default, item override, and nested-item isolation for chevron position; and
- trigger-label layout needed to preserve the position contract.

**Does not own / non-goals**

- caller-provided chevron, cue, icon, or render-function escape hatches;
- TreeList, Table, or another component's disclosure indicator;
- generic icon resolution or artwork customization;
- a shared responsive or directional API; or
- new content-reveal motion behavior. Existing behavior outside this decision stays
  unchanged until its own current authority changes it.

## Public concepts

| Concept                | Closed values or states              | Meaning                                                                                                            | Availability                     | Default                                          | Owner                                        | Stability | Invalid-value behavior                    |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------ | -------------------------------------------- | --------- | ----------------------------------------- |
| chevron position       | `start`, `end`                       | logical side of the trigger label that owns Collapsible's disclosure chevron                                       | Collapsible and CollapsibleGroup | `end`                                            | `component:Collapsible`                      | stable    | rejected by the public type               |
| disclosure state       | collapsed, expanded                  | whether the controlled region is hidden or revealed                                                                | every Collapsible                | existing state owner                             | `component:Collapsible` or group state owner | stable    | existing controlled/uncontrolled behavior |
| group position default | absent, `start`, `end`               | common position supplied to direct group items                                                                     | CollapsibleGroup                 | absent, so item default resolves to `end`        | `component:Collapsible`                      | stable    | rejected by the public type               |
| animated layout        | absent, a `useAnimatedLayout` handle | whether opening and closing glide the content after the Collapsible, up to the handle's container (`spec:AST-105`) | every Collapsible                | absent: content after it takes its place at once | `spec:AST-105`                               | stable    | rejected by the public type               |

The public prop is named `chevronPosition`. The exported value type is
`CollapsibleChevronPosition`. `placement`, `side`, and rendering terminology are
not parallel public names for this axis.

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                            | Basis                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| FR1  | Collapsible MUST expose `chevronPosition?: 'start' \| 'end'`; omission resolves to `end`.                                                                                                                                                                                                                                                                                                                                            | owner API decision; preserves released default            |
| FR2  | `end` MUST render Collapsible's chevron after the trigger label in logical order. Collapsed `end` points downward; expanded `end` points upward.                                                                                                                                                                                                                                                                                     | shipped trailing behavior plus approved position contract |
| FR3  | `start` MUST render Collapsible's chevron before the trigger label in logical order. Collapsed `start` points inward toward the label/content, so its inline direction mirrors under RTL; expanded `start` points downward.                                                                                                                                                                                                          | approved leading-disclosure behavior                      |
| FR4  | Position changes the chevron glyph/direction as well as DOM order. Reusing a vertical down chevron and rotating it sideways MUST NOT make collapsed `start` point away from its content.                                                                                                                                                                                                                                             | direction and representation decision                     |
| FR5  | Collapsible owns and renders the chevron for both positions. The position axis MUST NOT accept `none`, arbitrary React content, a cue callback, a renderer, or another replacement escape hatch.                                                                                                                                                                                                                                     | constrained public-axis decision                          |
| FR6  | Trigger-label content MUST retain the usable row width needed by composed labels at either position. Moving the chevron to `start` MUST NOT strand the label at the opposite edge or prevent composed label content from using the remaining row.                                                                                                                                                                                    | approved layout rationale and existing grow behavior      |
| FR7  | CollapsibleGroup MAY provide one `chevronPosition` default to its direct Collapsible items. A direct item's explicit position MUST override the group default.                                                                                                                                                                                                                                                                       | approved group-coherence behavior                         |
| FR8  | A Collapsible nested inside another item's revealed content MUST begin a new presentation scope and use its own explicit position or the component default. The outer group's position MUST NOT leak into the nested disclosure.                                                                                                                                                                                                     | approved nested isolation behavior                        |
| FR9  | Chevron position MUST NOT change disclosure semantics. The same trigger remains a button, retains `aria-expanded`, identifies the controlled region with `aria-controls`, and follows the existing state owner.                                                                                                                                                                                                                      | existing accessibility and behavior contract              |
| FR10 | Collapsible MUST accept `animatedLayout?: AnimatedLayout`. With a handle, opening and closing report the content's size change through it, so the content after the Collapsible glides inside the handle's container, and the revealed content and the chevron move on the same motion (`spec:AST-105` FR1–FR4; `spec:AST-108` FR4a). Without one, opening and closing are unchanged. The prop MUST NOT change disclosure semantics. | `spec:AST-105` FR1, FR2                                   |

### Allowed variation

- **AV1 — Artwork implementation.** The exact internal Icon names and transform
  implementation may change if FR2–FR4 remain visually and directionally true.
- **AV2 — Spacing mechanism.** Margin, gap, or equivalent internal layout may
  separate a leading chevron from its label while preserving FR6.
- **AV3 — Group consistency.** An item may explicitly override its group's
  position. Mixed positions are supported by precedence but should remain an
  intentional exception rather than an accidental row-to-row pattern.
- **AV4 — Existing non-chevron behavior.** Open-state ownership, disabled behavior,
  divider/density presentation, content layout, and reveal motion remain governed
  by their existing authority and are not changed by this decision.

### Representative states

| State                              | Required invariant                                                           | Allowed variation                    |
| ---------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| omitted position, collapsed        | chevron follows label and points down                                        | internal icon implementation         |
| omitted position, expanded         | chevron follows label and points up                                          | internal rotation implementation     |
| `start`, collapsed LTR             | chevron precedes label and points inline-end toward content                  | internal artwork                     |
| `start`, collapsed RTL             | chevron precedes label at logical start and points inline-end toward content | internal artwork/mirroring mechanism |
| `start`, expanded                  | chevron precedes label and points down                                       | internal transition mechanism        |
| group `start`, item omitted        | direct item resolves to `start`                                              | presentation-context implementation  |
| group `start`, item `end`          | direct item resolves to `end`                                                | presentation-context implementation  |
| group `start`, nested item omitted | nested item resolves to component default `end`                              | context-reset implementation         |

### Transformation and precedence order

- **ORD1 — Position precedence.** Item `chevronPosition` → direct surrounding
  CollapsibleGroup `chevronPosition` → component default `end`.
- **ORD2 — Direction resolution.** Resolve position and open state first; apply
  document direction to `start`'s inward inline direction. `end` remains a vertical
  down/up indicator and does not mirror into a horizontal cue.

## Accessibility contract

- **AR1 — Disclosure semantics stay primary.** The trigger MUST expose its expanded
  state and controlled-region relationship independently of the chevron artwork.
- **AR2 — Position is visual order, not reading duplication.** Moving the decorative
  chevron MUST NOT duplicate the accessible name or add a second focus target.
- **AR3 — Direction remains understandable.** The collapsed leading cue MUST point
  toward the content in both LTR and RTL; it MUST NOT retain an LTR physical
  direction under RTL.

## Design relationships

The two positions express established disclosure patterns:

- `end` is a trailing status indicator: down when collapsed, up when expanded;
- `start` is a leading tree/file-browser disclosure arrow: inward when collapsed,
  down when expanded.

This contract chooses those relationships but does not expose arbitrary icon or cue
selection. Themes may style the owning Collapsible target without changing the
semantic direction or position states.

## Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Container": {"target": "collapsible"},
  "Trigger": {"target": "collapsible-trigger"},
  "Chevron": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Content": {"target": "collapsible-content"},
  "Group container": {"target": "collapsible-group"}
}
```

The container owns divided-row chrome, while the trigger and content own their
independent paint and open-state selector surfaces. The chevron keeps Icon's
target; Collapsible owns its semantic position and direction. CollapsibleGroup is
an aggregate subcomponent of this contract, so its conditional wrapper target maps
to the Group container anatomy here.

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, target
  placement, visual-axis and state reflection, and delegated Icon ownership.
- The public `useCollapsible` hook retains its existing state behavior and consumer
  documentation. This component owns the rendered trigger, chevron, and aggregate
  component/group protocol.
- `architecture:public-component-api` owns reachability and compatibility of the
  admitted position prop and exported type.
- `architecture:react-component-runtime` owns context identity/lifecycle; this
  record owns the presentation value and nested-scope outcome.
- `spec:AST-002/DEC-1` admits this axis because otherwise-identical disclosure
  layouts require caller-owned leading versus trailing patterns. It does not admit
  custom cue rendering.

## Verification map

| Contract           | Verification                                                                                                                                                                                                                                                                                                                                                            | Representative states                                                                | Mutation or failure expectation                                                                                                                                                                    | Audit section                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1–FR5            | Collapsible prop/type, DOM-order, glyph/direction, and no-extra-values tests                                                                                                                                                                                                                                                                                            | omitted/end/start; collapsed/expanded; LTR/RTL                                       | default changes, `start` follows the label, collapsed leading cue points outward, or an unsupported cue value is admitted                                                                          | audit:Collapsible/public-api    |
| FR6                | composed trigger layout and geometry tests                                                                                                                                                                                                                                                                                                                              | plain text; composed label with trailing content; start/end                          | label becomes shrink-wrapped/stranded or composed content cannot use remaining row                                                                                                                 | audit:Collapsible/layout        |
| FR7–FR8, ORD1      | group inheritance, item override, and nested reset tests                                                                                                                                                                                                                                                                                                                | group start/end; item override; nested omission                                      | group value is ignored, item cannot override, or position leaks into nested content                                                                                                                | audit:Collapsible/behavior      |
| FR9, AR1–AR3, ORD2 | disclosure semantics via `DISCLOSURE_PATTERN`, plus component-owned chevron and real RTL rendering                                                                                                                                                                                                                                                                      | collapsed/expanded; controlled/uncontrolled; enabled/disabled; start/end; LTR/RTL    | position changes state behavior, the trigger loses its controlled-content relationship, content visibility diverges from state, accessible output duplicates, or leading direction fails to mirror | audit:Collapsible/accessibility |
| FR10               | `animatedLayoutAdopters.test.tsx` (with and without a handle; an owner-set `isOpen` and a group's controlled value glide; one measurement in StrictMode and none for a refused change; the exit kept inert until it ends) and `animatedLayoutAdopters.interaction.browser.spec.ts` (the `Core/Animated layout` story through a ScrollableArea ref, opening and closing) | no handle; a handle; click, owner-set, and group-driven changes; opening and closing | the content after it jumps with a handle, an owner-set change lands at once, closing content vanishes before its exit or stays reachable during it, or anything changes without a handle           | audit:Collapsible/behavior      |
| Theming anatomy    | focused target-reflection assertions plus `themingTargets.test.ts`                                                                                                                                                                                                                                                                                                      | standalone/grouped; open/closed; enabled/disabled; start/end; divided/density        | a style-driving axis or state disappears from its owning target, a target loses its anatomy owner, or the chevron stops delegating to Icon                                                         | audit:Collapsible/theming       |

## Decision log

### DEC-1 — Chevron position is the public axis

**Reference:** `component:Collapsible/DEC-1`
**Decider:** `cixzhang`, `2026-09-07`

Callers may choose the logical chevron position `start` or `end`. Collapsible owns
the cue and derives its position-specific glyph and direction. `start` exists for
leading disclosure patterns such as tree/file-browser rows; `end` preserves the
released trailing indicator.

Rejected: `chevronPlacement`, `none`, `hasChevron`, caller-provided cue content, and
rendering callbacks. Those surfaces expose rendering machinery or permit the
component's disclosure affordance to disappear rather than expressing the approved
caller-owned layout distinction.

### DEC-2 — Group defaults do not leak through content

**Reference:** `component:Collapsible/DEC-2`
**Decider:** `cixzhang`, `2026-09-07`

A CollapsibleGroup may provide position to its direct items, and an item may
override it. A Collapsible nested inside an item's body starts a new presentation
scope so an outer list's visual convention does not silently alter an independent
disclosure.

## Open questions

None.

## Content boundary

This file owns Collapsible's durable semantic concepts, chevron-position behavior,
precedence, and evidence. Consumer prop tables/examples remain in
`Collapsible.doc.mjs` and `CollapsibleGroup.doc.mjs`. Exact Icon names, transforms,
StyleX declarations, context fields, implementation plans, audit results, and pull-
request verdicts do not belong here.
