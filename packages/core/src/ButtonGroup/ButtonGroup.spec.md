---
schema_version: 3
template_version: 7
kind: component
id: component:ButtonGroup
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/ButtonGroup/ButtonGroup.test.tsx,
    packages/core/src/Layer/layerScopedContext.test.tsx,
    packages/core/src/hooks/useListFocus.test.tsx,
  ]
modules: []
families: [family:buttons]
design_specs: []
architecture:
  [
    architecture:component-size-cascade,
    architecture:component-theming-surface,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-038, spec:AST-085]
---

# ButtonGroup component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. ButtonGroup takes `label`, `orientation`, `size`, `elevation`, `isDisabled`, and Button or IconButton children.                                                                                                                 |
| Behavior                | A labelled `role="group"` that joins its Button members into one connected surface, gives them a default size and its disabled state, owns one shared elevation, and is one Tab stop with arrow-key roving.                                   |
| End-user impact         | Keyboard users reach the whole group with one Tab and move through it with arrows, which skip disabled members. A disabled group without tooltips has no Tab stop, so keyboard users cannot find it or hear that it is disabled.              |
| Builder impact          | None.                                                                                                                                                                                                                                         |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Disabled members use native `disabled`, the Tab stop leaves disabled and busy-only members, and wrapped members lose connected geometry; all are listed under Current-state impact. |
| Review checks           | Reject a group without a name, gaps between members, rounded inner corners, a shadow on a member, more than one Tab stop, arrows that land on a disabled member, or arrows that steal keys from a member's open menu.                         |
| Governing rules         | `family:buttons` FR3, FR8, FR10–FR12, AV5; `architecture:component-size-cascade` INV3–INV8; `spec:AST-085` FR1, FR7; `spec:AST-038` FR7, FR8.                                                                                                 |

This table is a review projection; the body below is authoritative.

## Intent

ButtonGroup presents a few related actions as one connected control. It owns
the group's accessible name, connected geometry, shared elevation, inherited
size and disabled state, and the group's single-Tab-stop keyboard model, as
`family:buttons` assigns. Consumer usage lives in `ButtonGroup.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; `orientation="horizontal"`, `size="md"`,
  `elevation="none"`, `isDisabled={false}`
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The group root: role, accessible name, orientation and disabled exposure, and
  the `button-group` target.
- Connected geometry its Button members paint: outer-only corners, leading-edge
  dividers, and no press scale.
- One shared resting elevation, and flat members.
- The default size and disabled state it gives its members.
- Roving focus: one Tab stop, arrow keys, Home and End.

**Does not own / non-goals**

- Each member's own surface, naming, activation, pending, and disabled rendering
  — owned by `component:Button` and `component:IconButton`.
- A member's menu or other layer, and keys pressed inside it — owned by that
  member (for example `component:DropdownMenu`).
- Selection state across toggles — owned by `component:ToggleButtonGroup`.
- Horizontal overflow — uncontracted; the group does not wrap or collapse.
- Nested ButtonGroups — unsupported; behavior is uncontracted.

## Public concepts

| Concept     | Closed values or states      | Meaning                                   | Availability by variant/orientation/state | Default                   | Owner                   | Stability | Invalid-value behavior           |
| ----------- | ---------------------------- | ----------------------------------------- | ----------------------------------------- | ------------------------- | ----------------------- | --------- | -------------------------------- |
| Orientation | `horizontal`, `vertical`     | Direction of the row and of arrow keys.   | Always.                                   | `horizontal`              | `component:ButtonGroup` | Stable    | TypeScript rejects other values. |
| Size        | `sm`, `md`, `lg`             | Default size for members.                 | Always; a member's own `size` wins.       | Inherited size, else `md` | `family:buttons`        | Stable    | TypeScript rejects other values. |
| Elevation   | `none`, `low`, `med`, `high` | Shadow under the whole connected surface. | Always; members paint none.               | `none`                    | `family:buttons`        | Stable    | TypeScript rejects other values. |
| Disabled    | off, on                      | Every Button member is disabled.          | Always.                                   | off                       | `component:ButtonGroup` | Stable    | Not applicable.                  |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Basis                                                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| FR1  | The root is one element with `role="group"` and `aria-label` set to `label`. It reflects orientation as `data-orientation`, never `aria-orientation`, and sets `aria-disabled="true"` only while disabled. `ref`, `data-testid`, `className`, `style`, `xstyle`, and other DOM props reach it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `family:buttons` FR11; current source and tests                                     |
| FR2  | Members sit edge to edge with no gap, stretched across the cross axis: a row when horizontal, a column when vertical.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `family:buttons` FR12; current source                                               |
| FR3  | Group geometry is painted by Astryx Button members; other children keep their own paint. Only the group's outer corners are rounded: the first member's leading corners and the last member's trailing corners. A trailing layer element a member renders after itself (popover, template, or dialog) does not count as a member, so the real last member keeps its rounded corners. Any other following element, including a display-contents wrapper or a raw button, counts as a member. A Button member wrapped in a Tooltip or HoverCard MUST join the connected surface like a direct member (`family:buttons` FR12). Implementation gap: inside that display-contents wrapper the Button is both the first and the last child, so in a group of two or more it keeps all four corners rounded wherever it sits, and draws no divider when it is not first.                                                                                        | `family:buttons` FR12; current tests                                                |
| FR4  | Every Button member after the first draws a divider on its leading edge (inline-start when horizontal, block-start when vertical) in the border color, or in the on-accent color on a primary or destructive member; a wrapped member does not (FR3 gap). Members do not take Button's press scale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `family:buttons` FR12; current source                                               |
| FR5  | The group paints the shadow for its `elevation`, following the element radius. Every Button member paints no shadow and reflects `data-elevation="none"`, whatever its own `elevation` says.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `family:buttons` FR8, FR10; current tests                                           |
| FR6  | The group provides its resolved size to descendants up to the next layer boundary (`spec:AST-038` FR7, FR8): an explicit `size`, then the nearest outer provider, then `md`. A member's own `size` wins.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `architecture:component-size-cascade` INV3–INV8; current source; `spec:AST-038` FR7 |
| FR7  | While disabled, every Button member MUST be disabled under `component:Button` FR10: focusable with `aria-disabled`, inert, and never running its action, so the group keeps its Tab stop (`spec:AST-085` FR1, FR7). Implementation gap: members without a tooltip render native `disabled`, so a disabled group contributes no Tab stop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `family:buttons` FR3; `spec:AST-085` FR7; current tests                             |
| FR8  | The group is one Tab stop. The stop starts on the first enabled member and moves with arrow navigation. A link member counts as a member. The stop MUST always sit on exactly one member, and a member that becomes busy or disabled MUST keep it (`component:Button` FR9, FR10; `spec:AST-085` FR1, FR7). Implementation gap: the group repairs the stop only after its own renders and when focus enters a member, and each repair keeps an enabled holder or gives the stop to the first enabled member. Between repairs the stop can sit on a member that has become busy-only, disabled, or unmounted, so the group can have a second stop or none; focus that arrives by pointer or by code does not take the stop, so the next Tab or Shift+Tab can stop inside the group; and a fully disabled group repairs nothing, so a group disabled from its first render gives each tooltip-bearing member its own stop and native-disabled members none. | `family:buttons` AV5; WAI-ARIA APG roving tabindex; current tests                   |
| FR9  | Horizontal groups move with Left and Right in visual order, reversed under RTL; vertical groups move with Up and Down. Home and End jump to the first and last enabled member. Movement wraps at the ends and skips natively disabled and `aria-disabled` members, busy-only members (`component:Button` FR9) included; a member busy with an interruptible action stays in the order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `family:buttons` AV5; current tests                                                 |
| FR10 | Keys pressed inside a member's open layer (such as a DropdownMenu) belong to that layer, and the group keeps its Tab stop on its own members. A group inside a popover or other layer still handles its own arrow keys. The group's context does not reach Buttons rendered inside a member's layer (`spec:AST-038` FR7).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current source and tests; `spec:AST-038` FR7                                        |
| FR11 | The root carries `astryx-button-group` and reflects `data-size`, `data-orientation`, and `data-elevation`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `family:buttons` FR10; `architecture:component-theming-surface`; tests              |

### Allowed variation

- **AV1 — Members.** Button, IconButton, and a Button-triggered DropdownMenu are
  supported members; variants may differ between members.
- **AV2 — Theme paint.** Themes may restyle the group and member surfaces
  through `button-group` and `button` without changing connected geometry.

### Representative states

| State                 | Required invariant                                                                                                                                                                                                                | Allowed variation       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Horizontal, at rest   | Named group; one Tab stop on the first member; outer corners only.                                                                                                                                                                | Member variants.        |
| Vertical              | Column; Up and Down move focus; block-start dividers.                                                                                                                                                                             | —                       |
| Elevated              | Shadow on the group; members flat.                                                                                                                                                                                                | Tier.                   |
| Trailing DropdownMenu | The menu trigger keeps rounded trailing corners; arrows inside the open menu stay with it.                                                                                                                                        | Menu content.           |
| One member disabled   | Arrows skip it. Implementation gap: the Tab stop leaves it when the group repairs (FR8).                                                                                                                                          | Tooltip present or not. |
| Group disabled        | `aria-disabled` on the group; every member focusable and inert; one Tab stop. Implementation gap: native-disabled members give no Tab stop; disabled from the first render, tooltip-bearing members are one stop each (FR7, FR8). | —                       |

### Transformation and precedence order

- **ORD1 — Member size.** Member `size`, then the group's resolved size.
- **ORD2 — Member elevation.** Inside a group, always `none`; the group's
  `elevation` paints.
- **ORD3 — Member availability.** A member is disabled when the group or the
  member is disabled; neither can re-enable the other. Otherwise Button's own
  availability rules apply.

### Performance and resources

- **PR1 — Tab-stop repair.** The group repairs the Tab stop after each of its
  own renders and when focus enters a member; it adds no global listener.

## Accessibility contract

- **AR1 — Group name.** The group exposes `role="group"` and its `label` as
  its accessible name; members keep their own names (`family:buttons` FR11).
- **AR2 — Keyboard.** FR8–FR10 are the keyboard contract.
- **AR3 — Disabled exposure.** A disabled group exposes `aria-disabled` on the
  group; members expose disabled per `component:Button` AR5 (FR7 gap).
- **AR4 — Focus indicator.** Each member paints Button's focus indicator.

## Design relationships

| Anatomy or state | Design requirement                                                    | Representation authority | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Button           | Members joined into one surface with outer-only corners.              | Current source and tests | Prominent      | FR2, FR3           |
| Divider          | Thin leading-edge border between members; on-accent on solid members. | Current source           | Supporting     | FR4                |
| Group shadow     | One shadow under the connected surface.                               | Current source and tests | Supporting     | FR5                |

No design record governs ButtonGroup. The root carries the `button-group`
target; the Button and Divider anatomy parts are painted by each member's
`button` target. The consumer anatomy names no root part, so this record
carries no anatomy-theming map.

## Family and system relationships

- `family:buttons` assigns ButtonGroup connected geometry, roving focus,
  inherited size and disabled state, and one shared elevation (FR8, FR11,
  FR12); ButtonGroup adopts them.
- `component:Button` paints the connected geometry from the group's context
  and owns each member's behavior.
- `architecture:component-size-cascade` owns size inheritance (FR6).
- `spec:AST-085` FR7 applies to group disablement; the gap is FR7 here.

## Verification map

| Contract             | Verification                                                                                                                                                                                                                                                                                       | Representative states                                               | Mutation or failure expectation                                                                                                                                                                                                                                               | Audit section                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| FR1, AR1             | `ButtonGroup.test.tsx` role, label, ref, `data-testid`, orientation                                                                                                                                                                                                                                | Horizontal and vertical                                             | A missing name, `aria-orientation`, a dropped ref, or a dropped `data-testid` fails. Evidence gap: no test passes `className`, `style`, or `xstyle`.                                                                                                                          | `audit:ButtonGroup/accessibility` |
| FR3                  | `ButtonGroup.test.tsx` trailing-radius suite                                                                                                                                                                                                                                                       | Tooltip, link, DropdownMenu, HoverCard, and raw-button members      | A square trailing member, or a rounded inner member, fails. Evidence gap: the suite renders wrapped members only last and asserts the member before them; no test checks a wrapped member's own corners or divider in any position.                                           | `audit:ButtonGroup/layout`        |
| FR5, FR11            | `ButtonGroup.test.tsx` elevation suite                                                                                                                                                                                                                                                             | Every tier; member with its own elevation                           | Identical classes for two tiers, a mismatched `data-elevation`, or a member not reporting `none` fails.                                                                                                                                                                       | `audit:ButtonGroup/theming`       |
| FR11 (target, size)  | Evidence gap: no test asserts `astryx-button-group` or `data-size` on the root                                                                                                                                                                                                                     | Each size                                                           | —                                                                                                                                                                                                                                                                             | `audit:ButtonGroup/theming`       |
| FR7, AR3             | `ButtonGroup.test.tsx` disabled cases                                                                                                                                                                                                                                                              | Group disabled                                                      | An operable member fails. Native-disabled and no-Tab-stop assertions match the FR7 gap.                                                                                                                                                                                       | `audit:ButtonGroup/accessibility` |
| FR8, AR2             | `ButtonGroup.test.tsx` roving-tabindex suite                                                                                                                                                                                                                                                       | Enter and leave; disabled member; unmount; becomes disabled; link   | Two Tab stops or a lost stop fails. The suite asserts that a disabled member never holds the stop and that the stop is repaired away from it, matching the FR8 gap. Evidence gap: no test of a busy or self-unmounted holder, pointer focus, or a group disabled after mount. | `audit:ButtonGroup/accessibility` |
| FR9, FR10, AR2       | `ButtonGroup.test.tsx` keyboard-navigation suite; `useListFocus.test.tsx` "useListFocus disabled-item skipping" for `aria-disabled` items and Home and End; `layerScopedContext.test.tsx` "ends group-owned disabled state while preserving explicit and inner-group state" for the layer boundary | Arrows, Home, End, vertical, RTL, open menu, group inside a popover | Wrong direction, no wrap, landing on a disabled member, stealing a menu's keys, or group state leaking into a member's layer fails. Evidence gap: no test skips a busy or tooltip-disabled Button member.                                                                     | `audit:ButtonGroup/accessibility` |
| FR2, FR3, FR4, FR6   | Evidence gap: no assertion of gap-free layout, divider paint, the absent press scale, non-Button children keeping their own paint, or member size inheritance beyond rendering                                                                                                                     | —                                                                   | —                                                                                                                                                                                                                                                                             | `audit:ButtonGroup/layout`        |
| ORD2                 | `ButtonGroup.test.tsx` elevation suite                                                                                                                                                                                                                                                             | Member with its own elevation                                       | A member not reporting `none` fails.                                                                                                                                                                                                                                          | `audit:ButtonGroup/theming`       |
| ORD1, ORD3, PR1, AR4 | Evidence gap: no test asserts member size precedence, a member `isDisabled` inside an enabled group, when the Tab stop is repaired, or the member focus indicator                                                                                                                                  | —                                                                   | —                                                                                                                                                                                                                                                                             | `audit:ButtonGroup/behavior`      |

## Current-state impact

- **Disabled focusability (FR7, AR3).** A disabled group renders its members
  with native `disabled`, so the group has no Tab stop, against `spec:AST-085`
  FR1 and FR7 and `family:buttons` FR3. The group's tests assert that state.
- **Tab stop (FR8).** The Tab stop leaves a disabled or busy-only member when the
  group repairs it; between repairs the group can have a second stop or none,
  including after a pointer click on a member or when the holder unmounts or
  disables itself; and a group disabled from its first render gives each
  tooltip-bearing member its own stop, against `spec:AST-085` FR1 and FR7.
- **Wrapped members (FR3, FR4).** A Button wrapped in a Tooltip or HoverCard
  keeps four rounded corners in any position, and no divider when it is not
  first, against
  `family:buttons` FR12.

## Decision log

No component-local decision. ButtonGroup applies `family:buttons`.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
