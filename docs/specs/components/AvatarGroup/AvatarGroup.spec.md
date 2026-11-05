---
schema_version: 3
template_version: 7
kind: component
id: component:AvatarGroup
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/AvatarGroup/AvatarGroup.test.tsx,
    packages/core/src/AvatarGroup/AvatarGroupOverflow.test.tsx,
    packages/core/src/Avatar/Avatar.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/AvatarGroup.stories.tsx,
    apps/storybook/stories/AvatarGroupOverflow.stories.tsx,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:internationalization,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-009, spec:AST-038]
---

# AvatarGroup component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A labelled group of caller-supplied Avatar children, optionally ending in one AvatarGroupOverflow, with a uniform `size` and `shape`.                          |
| Behavior                | Members overlap by a quarter of the avatar size; interactive members share one tab stop with arrow-key roving and a translated keyboard hint.                  |
| End-user impact         | Screen-reader users hear a named group; keyboard users Tab into the group once and move between interactive avatars with arrow keys.                           |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                   |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. One implementation gap is listed under Current-state impact.                        |
| Review checks           | Reject a member whose own size or shape wins inside the group, more than one tab stop over interactive members, or a keyboard hint with no interactive member. |
| Governing rules         | `architecture:public-component-api/INV5,INV6,INV7,INV8`; `architecture:component-theming-surface/INV2,INV6`; `architecture:internationalization/INV1a`.        |

This table is a review projection; the body below is authoritative.

## Intent

AvatarGroup shows several people as one compact, overlapping row. It owns the
group's name, the uniform size and shape it passes to its members, the overlap
geometry, and keyboard movement between interactive members.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Stale hint and tab stop (FR5, AR2, AR3).** When a member becomes a link or
  button, or turns static, through its own state while the group does not
  render, the group keeps its previous hint and tab stop. New interactive
  members get no hint and are separate Tab stops until focus enters the group;
  a group left with no interactive members keeps a stale hint; and when the
  member holding the tab stop turns static, the remaining links keep
  `tabindex="-1"`, so Tab skips the group and keyboard users cannot reach them
  until it renders again.

## Ownership boundary

**Owns**

- The group root, its role and name, and its `avatar-group` target.
- Size, shape, overlap, and numeric size supplied to members through context.
- The start padding that keeps the first overlapped member inside the group.
- Roving focus over members carrying the avatar item marker, and the keyboard
  hint.

**Does not own / non-goals**

- Which avatars are visible and the hidden count — owned by the product
  callsite, which slices its list.
- Each member's rendering, name, tooltip, and in-group ring — owned by
  `component:Avatar`.
- The "+N" indicator — owned by `component:AvatarGroupOverflow`.

## Public concepts

| Concept  | Closed values or states         | Meaning                                             | Availability by variant/orientation/state | Default  | Owner                   | Stability | Invalid-value behavior           |
| -------- | ------------------------------- | --------------------------------------------------- | ----------------------------------------- | -------- | ----------------------- | --------- | -------------------------------- |
| Size     | Any `component:Avatar` size     | Applied to every member and the overflow indicator. | All groups                                | `md`     | `component:AvatarGroup` | Stable    | TypeScript rejects other values. |
| Shape    | `circle`, `rounded`, `square`   | Applied to every member and the overflow indicator. | All groups                                | `circle` | `component:AvatarGroup` | Stable    | TypeScript rejects other values. |
| Keyboard | static group; interactive group | Whether any member carries the avatar item marker.  | Read at each of the group's own renders   | static   | `component:AvatarGroup` | Stable    | —                                |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | The root is an inline-flex, vertically centered `div` with `role="group"`, named by the caller's `aria-label` or `aria-labelledby`, else the translated "Avatars". It carries the `avatar-group` target reflecting `size` and `shape`, and renders children in order.                                                                                                                                                                                                                                                             | Current source and tests |
| FR2 | The group supplies its `size`, `shape`, numeric size, and an overlap of a quarter of the numeric size, rounded, to every Avatar and AvatarGroupOverflow below it in the same layer (`spec:AST-038` FR7, FR8; a member in a hover card, popover, or other layer keeps its own size and shape, though a marked member there stays in the FR4 roving set); a member's own size and shape never win, including when the group uses its defaults.                                                                                      | Current source and tests |
| FR3 | Every member takes the negative overlap as its inline-start margin, including the first; the group pads its inline start by the same amount so the first member stays inside it, and an empty group has no start padding. The overlap holds when members are wrapped in a HoverCard or Tooltip.                                                                                                                                                                                                                                   | Current source and tests |
| FR4 | Elements carrying `data-avatar-item` — link and button avatars and a clickable overflow indicator — form one horizontal roving set with a single tab stop: arrow keys move between them following the rendered direction and wrap at the ends, and Home and End jump to the first and last. Other focusable content in a member, such as a button in a status slot, is not in the set.                                                                                                                                            | Current source and tests |
| FR5 | The hint and tab stop follow whether any member carries the item marker as read at the group's own last render: while one does, a visually hidden translated hint ("Use arrow keys to move between avatars") renders inside the group and is appended to `aria-describedby` after any caller value; a purely static group has no tab stop and no hint. Implementation gap: a member that gains or loses the marker through its own state, without the group rendering, leaves the hint and tab stop stale (Current-state impact). | Current source and tests |
| FR6 | `ref` reaches the root. Supported DOM, ARIA, data, and event props reach the root; the component's role, name, description, and `data-testid` apply after them; caller `onKeyDown` and `onFocus` run before the roving handlers, and one that calls `preventDefault()` skips the roving handler for that event (`architecture:public-component-api` INV7); `xstyle`, `className`, and `style` merge in that order after component styles.                                                                                         | Current source and tests |

### Allowed variation

- **AV1 — Theme paint.** A theme may restyle `avatar-group` per `size` and
  `shape` without changing membership, overlap ownership, or focus behavior.
- **AV2 — Membership.** The number and kind of members vary per callsite.

### Representative states

| State                | Required invariant                                                         | Allowed variation |
| -------------------- | -------------------------------------------------------------------------- | ----------------- |
| Static group         | Named group; no tab stop; no hint.                                         | Members.          |
| Interactive group    | One member has `tabIndex={0}`, the rest `-1`; arrows rove; hint described. | Members.          |
| With overflow button | The overflow indicator is the last roving item.                            | Count.            |
| Empty group          | Renders with no start padding.                                             | —                 |
| Right-to-left        | Overlap and arrow movement follow the rendered direction.                  | —                 |

### Transformation and precedence order

- **ORD1 — Member size and shape.** Group value → member's own prop (ignored
  inside a group).
- **ORD2 — Description.** Caller `aria-describedby` → keyboard hint id.
- **ORD3 — Key and focus handling.** Caller `onKeyDown` or `onFocus` → roving
  handler; a caller handler that calls `preventDefault()` skips the roving
  handler for that event.

### Performance and resources

- **PR1 — Member detection.** Detecting interactive members adds no observer or
  listener; the group re-reads its members after each of its own renders, and a change in
  whether any member is interactive re-renders the group before paint.

## Accessibility contract

- **AR1 — Named group.** The root is `role="group"` with a translated default
  name the caller can replace.
- **AR2 — One tab stop.** Interactive members share a single tab stop and are
  reached with arrow keys, Home, and End, in visual order in both directions,
  as read at the group's own last render (FR5 gap for member-local changes).
- **AR3 — Keyboard hint.** The hint describes the group only while roving
  applies, as read at the group's own last render (FR5 gap for member-local
  changes).
- **AR4 — Static members.** Static avatars are not roving items and have no tab
  stop inside a group; `component:Avatar` records the effect on their tooltips.

## Design relationships

| Anatomy or state   | Design requirement                              | Representation authority | Hierarchy role | Component contract |
| ------------------ | ----------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Avatar children    | Uniformly sized members overlapping in one row. | Current source and docs  | Prominent      | FR1–FR3            |
| Overflow indicator | An optional "+N" member at the end of the row.  | Current source and docs  | Supporting     | FR2, FR4           |

Theming: the root is the `avatar-group` target. Members keep their own targets;
the overflow indicator's `avatar-group-overflow` target belongs to
`component:AvatarGroupOverflow`. The consumer anatomy names no root part, so no
anatomy-theming block is declared.

## Family and system relationships

- `component:Avatar` reads the group context and applies the ring, overlap, and
  item marker on its own root.
- `component:AvatarGroupOverflow` reads the same context and joins the roving
  set when clickable.
- `architecture:internationalization` owns the catalog behind the group name
  and hint.

## Verification map

| Contract       | Verification                                                                                                                                     | Representative states                                             | Mutation or failure expectation                                                                                                                                                                                                                 | Audit section                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| FR1, AR1       | `AvatarGroup.test.tsx` render, label, size-reflection, test-id, and empty-group tests                                                            | Default and custom `aria-label`; sizes; empty                     | A missing `group` role, default or custom name, `data-size` reflection, or child fails. Gap: no test asserts the inline-flex centering, `data-shape`, child order, a caller `aria-labelledby`, or a caller `role` being replaced.               | `audit:AvatarGroup/a11y`     |
| FR2, ORD1      | `AvatarGroup.test.tsx` size-cascade and overlap suites; `Avatar.test.tsx` group shape tests; `AvatarGroupOverflow.test.tsx` size and shape tests | Group size and shape, defaults, outside a group; `md` overlap     | A member's own size or shape winning inside the group, or a wrong `md` overlap value, fails. Gap: no test asserts the overlap value for sizes other than `md`, or that a member in another layer keeps its own size and shape.                  | `audit:AvatarGroup/behavior` |
| FR3            | `AvatarGroup.test.tsx` overlap suite                                                                                                             | Plain and wrapped members, overflow indicator, empty group        | A missing member margin, a missing start padding, or start padding on an empty group fails.                                                                                                                                                     | `audit:AvatarGroup/layout`   |
| FR3 (layout)   | `AvatarGroup.stories.tsx` sizes; `AvatarGroupOverflow.stories.tsx` AllShapes                                                                     | Sizes and shapes, LTR and RTL                                     | Gap: no automated check; a clipped first member or an unmirrored overlap is visible only in the rendered fixtures.                                                                                                                              | `audit:AvatarGroup/layout`   |
| FR4, AR2, AR4  | `AvatarGroup.test.tsx` roving-focus suite                                                                                                        | Interactive avatars, overflow button, status button, static group | More than one tab stop, lost ArrowRight/ArrowLeft movement, a missing overflow item, a status button in the set, or a tab stop on a static group fails. Gap: wrapping, Home and End, and right-to-left arrow direction have no automated check. | `audit:AvatarGroup/a11y`     |
| FR5, AR3, ORD2 | `AvatarGroup.test.tsx` hint tests                                                                                                                | Interactive and static groups                                     | A missing hint on an interactive group, or a hint on a static one, fails. Gap: no test covers the hint's order after a caller `aria-describedby` or a member changing interactivity through its own state.                                      | `audit:AvatarGroup/a11y`     |
| FR6, ORD3      | `AvatarGroup.test.tsx` test-id test                                                                                                              | Caller `data-testid`                                              | A lost test id fails. Gap: no test covers the ref, DOM passthrough, attribute order, caller handler order and cancellation, or the styling-input merge.                                                                                         | `audit:AvatarGroup/api`      |
| PR1            | Source review                                                                                                                                    | Interactive and static groups                                     | Gap: no automated check fails if member detection adds an observer or listener.                                                                                                                                                                 | `audit:AvatarGroup/behavior` |
| AR1, AR3       | Accessibility-tree evidence (`spec:AST-009` FR3)                                                                                                 | Static and interactive groups                                     | Gap: no accessibility-tree check proves the group role, name, or description; the unit tests query the DOM.                                                                                                                                     | `audit:AvatarGroup/a11y`     |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
