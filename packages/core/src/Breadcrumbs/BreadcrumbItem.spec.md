---
schema_version: 3
template_version: 7
kind: component
id: component:BreadcrumbItem
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Breadcrumbs/Breadcrumbs.test.tsx,
    packages/core/src/Breadcrumbs/__tests__/Breadcrumbs.a11y.test.tsx,
    packages/core/src/Breadcrumbs/__tests__/Breadcrumbs.a11y.chromium.spec.ts,
    apps/storybook/stories/BreadcrumbItem.stories.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families:
  [
    family:navigation-destinations,
    family:overlay-dismissal,
    family:action-groups,
  ]
design_specs: [design:bidirectionality]
architecture:
  [
    architecture:component-style-authoring,
    architecture:component-test-sufficiency,
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:layer-runtime,
    architecture:public-component-api,
    architecture:react-component-runtime,
  ]
contributing: [contributing:api-conventions]
system_specs: [spec:AST-002, spec:AST-005]
---

# BreadcrumbItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `BreadcrumbItem` with `children`, `href`, `as`, `onClick`, `isCurrent`, `startIcon`, `menu`, and `menuSize`; targets `breadcrumb-item`, `breadcrumb-item-menu-trigger`, and `breadcrumb-menu`.                                                     |
| Behavior                | One crumb: a link, a link-styled button, plain text, the current page, or a sibling-menu trigger, chosen by ORD1. It renders its own decorative separator, hidden on the first crumb. The last crumb becomes current when no crumb says otherwise. |
| End-user impact         | Users move up the hierarchy, open sibling destinations from a crumb's menu, and hear which crumb is the current page.                                                                                                                              |
| Builder impact          | None.                                                                                                                                                                                                                                              |
| Compatibility/readiness | Records shipped behavior; no public change. Two implementation gaps: automatic current-page state is applied after render, and can land on the list item (see Current-state impact).                                                               |
| Review checks           | Reject a current item without `aria-current="page"` on its content owner (apart from the recorded `<li>` fallback), an exposed separator, a menu without its name, state, and control link, or menu closing that steals valid outside focus.       |
| Governing rules         | `component:Breadcrumbs`; `family:navigation-destinations`; `family:overlay-dismissal`; `component:Popover`; `design:bidirectionality` DR4; `architecture:react-component-runtime` INV1.                                                            |

This table is a review projection; the body below is authoritative.

## Intent

BreadcrumbItem presents one destination, action, current location, or
sibling-menu trigger inside a Breadcrumbs trail. Consumer usage lives in
`BreadcrumbItem.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Automatic current state is repaired after render.** When no crumb sets
  `isCurrent`, the last crumb first renders without `aria-current` and an
  Effect then inspects the sibling list in the DOM and adds `aria-current="page"`.
  `architecture:react-component-runtime` INV1 requires rendered output to start
  from a valid state rather than be repaired in a follow-up Effect.
- **Auto-current can land on the list item.** When the last crumb renders
  through a custom `as` or `LinkProvider` link that does not forward its ref,
  the auto-current repair sets `aria-current="page"` on the `<li>` and none on
  the link, so the link is not announced as the current page (FR3, AR2).

## Ownership boundary

**Owns**

- The list-item root, the item-content branch selected from current public inputs,
  and forwarding the documented item ref and `BaseProps` surface to that root.
- The decorative separator container rendered for its position in the trail.
- The link-styled action or menu trigger and BreadcrumbItem-specific menu surface,
  including their current theme targets.
- Deriving the menu-item size from the parent Breadcrumbs variant when no explicit
  menu size is supplied.

**Does not own / non-goals**

- The navigation landmark, ordered list, trail label, separator value, or visual
  variant — owned by `component:Breadcrumbs` through the public parent component.
- Destination acceptance and custom-router handoff — owned by
  `family:navigation-destinations` and the shared link owner.
- Generic top-layer hosting, focus containment, positioning, and light dismissal —
  owned by `component:Popover` and `architecture:layer-runtime`.
- Shared Escape/platform-close ordering — owned by
  `family:overlay-dismissal`.
- Menu-item data, row semantics, selection, or submenu behavior — delegated to the
  DropdownMenu item pipeline.
- Caller-provided icon artwork or arbitrary child content.

## Public concepts

| Concept       | Closed values or states                            | Meaning                                                                                                                         | Availability by variant/orientation/state | Default                                         | Owner                                          | Stability | Invalid-value behavior                                                                                    |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------- | ---------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| Item content  | required `ReactNode`                               | Supplies the visible item label and may contain caller-owned content.                                                           | Every item branch                         | Required                                        | `component:BreadcrumbItem`                     | Released  | React renders the supplied node.                                                                          |
| Destination   | supplied or absent `href`                          | Selects the shared link path when the item is not explicitly current and has no menu.                                           | Default and supporting variants           | Absent                                          | `family:navigation-destinations`               | Released  | Shared link handling decides accepted destinations.                                                       |
| Action        | supplied or absent `onClick`                       | Selects a native link-styled button when no destination or menu is supplied, or augments the link path when `href` is supplied. | Non-current items                         | Absent                                          | `component:BreadcrumbItem`                     | Released  | `menu` currently suppresses this input and warns in development.                                          |
| Current page  | `true`, `false`, or omitted                        | `true` explicitly marks the item current; `false` opts it out; omission makes the item an auto-current candidate.               | Every branch, including a menu trigger    | Omitted                                         | `component:BreadcrumbItem`                     | Released  | When no item is explicitly current, the last crumb receives `aria-current="page"` when it omits the prop. |
| Link renderer | per-item `as`, provider renderer, or native anchor | Selects the component that receives an accepted destination.                                                                    | Non-current link path                     | Provider renderer, then native anchor           | `family:navigation-destinations`               | Released  | Explicitly current and menu paths do not use it.                                                          |
| Start content | supplied or absent `startIcon`                     | Renders caller content before the item label.                                                                                   | Every item branch                         | Absent                                          | Caller                                         | Released  | Caller content remains caller-owned.                                                                      |
| Sibling menu  | data array, composed menu content, or absent       | Replaces the link/action content branch with a menu button and menu surface.                                                    | Current or non-current item               | Absent                                          | `component:BreadcrumbItem`; menu rows delegate | Released  | Currently suppresses `href` or `onClick` and warns in development.                                        |
| Menu size     | `sm`, `md`, or `lg`                                | Selects the delegated menu-row size.                                                                                            | Menu branch                               | `sm` for supporting Breadcrumbs; otherwise `md` | `component:BreadcrumbItem`                     | Released  | TypeScript rejects unsupported values.                                                                    |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Basis                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| FR1  | The item root is one `<li>` carrying the public ref, the `breadcrumb-item` target with the trail's variant, `data-testid`, styling escape hatches, and other DOM props.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Released types, source, docs, and tests; `architecture:public-component-api`      |
| FR2  | A non-current item with `href` and no menu uses the shared link renderer, with `onClick` on the link; an item with only `onClick` uses a native button styled as a link; an item with neither renders text content.                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Released source, docs, and tests                                                  |
| FR3  | Explicit `isCurrent=true` renders the content as text (or the menu trigger) carrying `aria-current="page"` and ignores `href` and `onClick`; explicit `false` opts out; when no item in the list carries `aria-current="page"`, the list's last child, if it omits the prop, receives it on its content owner (Current-state impact records the fallback to the `<li>`); a trail whose last child sets `isCurrent={false}` has no current crumb.                                                                                                                                                                                                                            | Released source, docs, and tests                                                  |
| FR4  | Every item renders one `aria-hidden` separator container before its content, hidden on the first item. The built-in `/` mirrors exactly once in RTL; caller-provided separators render as given.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Source, focused tests, and `design:bidirectionality` DR4                          |
| FR5  | A menu item exposes one menu button with `aria-haspopup="menu"`, its expanded state, and `aria-controls`, and one `role="menu"` surface labelled by the trigger, including non-string trigger content. Click, Enter, Space, and ArrowDown open it and focus its first item; Escape, Tab, and selection close it; arrows move between items without wrapping, and typeahead jumps to a matching item.                                                                                                                                                                                                                                                                        | APG Menu Button pattern, `component:Popover`, source, tests, and browser evidence |
| FR6  | Closing the menu preserves a newly focused outside control. Focus returns to the trigger only when the closing surface would otherwise strand focus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `component:Popover` and browser focus behavior                                    |
| FR7  | The menu branch delegates item rendering, selection, row focus, and submenu content to the shared DropdownMenu item pipeline, from a data array or composed children. With `menu`, `href` and `onClick` are ignored and a development warning is logged.                                                                                                                                                                                                                                                                                                                                                                                                                    | Released source and focused tests                                                 |
| FR8  | Omitted `menuSize` resolves to `sm` under the `supporting` variant and `md` otherwise before entering the menu pipeline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Released source and consumer docs                                                 |
| FR9  | The local targets are `breadcrumb-item` on the `<li>`, `breadcrumb-item-menu-trigger` on the menu button, and `breadcrumb-menu` on the menu surface; the first two reflect the trail's variant. Link, button, and menu trigger paint the shared focus outline.                                                                                                                                                                                                                                                                                                                                                                                                              | Released docs, source, and theming tests                                          |
| FR10 | In the open menu, a press (finger, pen or mouse) that lands on an enabled item and slides across the items acts on the one it lifts on, once, through that item's own activation, with the highlight following the pointer; a lift outside acts on nothing, and a mouse released outside closes the menu. The menu adopts `module:DropdownMenu/useMenuPress` for this (`family:action-groups` FR1–FR5; `module:DropdownMenu/useMenuPress` DEC-7). A press on caller content that is not an item, and a Ctrl-, Cmd- or Shift-click or a middle click on a link item, stays that content's or the browser's own, and keyboard and assistive-technology behavior is unchanged. | Current source and tests                                                          |

### Allowed variation

- **AV1 — Link renderer.** Native anchors and custom router components may differ in
  DOM implementation while preserving the shared destination contract.
- **AV2 — Caller content.** Labels and start content may be any renderable React
  content; the item owns surrounding semantics, not caller artwork or markup.
- **AV3 — Menu content.** Data-driven and composed content may produce actions,
  sections, dividers, selectable items, or submenus through the delegated pipeline.
- **AV4 — Theme.** Current targets and semantic tokens may change paint while item
  roles, focus ownership, and branch behavior remain stable.

### Representative states

| State            | Required invariant                                                                                             | Allowed variation                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Destination link | Shared link path, visible keyboard focus, and accepted destination behavior remain available.                  | Native or custom router renderer; optional start content.     |
| Action button    | Native button semantics and supplied click handling remain available.                                          | Default or supporting typography.                             |
| Explicit current | Current-page state is exposed on the rendered content owner.                                                   | Plain content or menu trigger.                                |
| Auto-current     | The last crumb, when it omits the prop, receives current-page state only when no explicit current item exists. | Link or text content remains in its released branch.          |
| Closed menu      | Trigger exposes `aria-haspopup="menu"`, controls the menu, and reports collapsed state.                        | Data-driven or composed rows; current or non-current trigger. |
| Open menu        | Named menu is top-layer reachable and focus enters its first eligible row.                                     | Row kinds, submenu content, and explicit menu size.           |
| Dismissed menu   | One dismissal closes the surface; valid outside focus is preserved and stranded focus returns to the trigger.  | Escape, selection, Tab, or native light dismiss.              |

### Transformation and precedence order

- **ORD1 — Content branch.** Explicit current is evaluated first; within either
  current or non-current state, `menu` selects the menu branch. Otherwise `href`
  selects the link branch, then `onClick` selects the action branch, then plain
  content remains.
- **ORD2 — Link renderer.** Per-item `as` wins over LinkProvider, which wins over
  the native anchor.
- **ORD3 — Menu size.** Explicit `menuSize` wins; otherwise supporting resolves to
  `sm` and every other parent variant resolves to `md`.

### Performance and resources

- **PR1 — Delegated layer resources.** BreadcrumbItem creates no independent global
  listeners or observers; menu lifecycle and focus resources remain delegated to
  Popover and shared menu hooks.
- **PR2 — Auto-current reconciliation.** Current source resolves omitted current
  state by inspecting the rendered sibling list after render. This is the gap
  recorded under Current-state impact, not an approved implementation
  requirement.

## Accessibility contract

- **AR1 — Trail semantics.** The parent Breadcrumbs landmark and ordered list own
  aggregate breadcrumb semantics; each item remains one list item.
- **AR2 — Current state.** The content owner for a current item exposes
  `aria-current="page"`; the list-item wrapper does not duplicate it.
  Implementation gap: auto-current falls back to the `<li>` when a custom link
  does not forward its ref (Current-state impact).
- **AR3 — Native interaction.** Links use link semantics, action-only items use a
  native button, and menu items use the APG Menu Button relationship.
- **AR4 — Menu name.** The menu surface is labelled by its trigger, including when
  the visible item content is a non-string React node.
- **AR5 — Focus.** Keyboard focus is visible on links and menu/action buttons. Menu
  entry, containment, Escape return, and outside-focus preservation follow FR5–FR6.
- **AR6 — Separator.** Separator content is hidden from assistive technology while
  remaining directionally correct for sighted readers.

## Design relationships

| Anatomy or state       | Design requirement                                                                               | Representation authority                                         | Hierarchy role    | Component contract |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------- | ------------------ |
| Item root              | Carries current typography and the `breadcrumb-item` target.                                     | Current source and public docs                                   | Supporting        | FR1, FR9           |
| Link or action content | Uses native semantics and the shared focus indicator without introducing another content target. | Current source; `architecture:interaction-modality`              | Supporting        | FR2, AR3, AR5      |
| Current content        | Uses the released non-color text emphasis alongside current-page semantics.                      | Current source and objective non-color communication             | Prominent         | FR3, AR2           |
| Separator              | Remains decorative to assistive technology and mirrors by contextual bidi role.                  | Objective bidi behavior                                          | Supporting        | FR4, AR6           |
| Menu trigger           | Paints the menu-trigger target on the native focus owner.                                        | Current source and public docs                                   | Supporting        | FR5, FR9, AR3–AR5  |
| Menu surface           | Paints the `breadcrumb-menu` refinement inside Popover's shared layer surface.                   | `component:Popover` plus current BreadcrumbItem target inventory | Prominent         | FR5–FR9            |
| Start content          | Renders caller content without claiming its artwork or semantics.                                | Caller content; `component:Icon` when composed                   | Context-dependent | AV2                |

## Family and system relationships

- `component:Breadcrumbs` supplies the separator and variant.
- `design:bidirectionality` DR4 governs the built-in separator's mirroring.
- `family:navigation-destinations` owns destination inspection and handoff for
  native and custom link paths. BreadcrumbItem composes the shared link owner.
- `family:overlay-dismissal` owns topmost Escape/platform-close routing.
  BreadcrumbItem participates through Popover.
- `component:Popover` owns generic menu-surface hosting, focus containment, and
  stranded-focus return; BreadcrumbItem owns its trigger and refinement target.
- `architecture:component-theming-surface` owns target qualification, placement,
  and state reflection.
- `architecture:public-component-api` and `spec:AST-002` own released API,
  precedence, invalid-state prevention, and compatibility review.

## Verification map

| Contract         | Verification                                                                     | Representative states                                                                      | Mutation or failure expectation                                                                     | Audit section                                 |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| FR1–FR3, AR1–AR3 | `Breadcrumbs.test.tsx` branch, test-id, and current-state suites                 | Link, action, explicit current, omitted last crumb                                         | A branch changes semantic element, loses current state, or moves the public root contract.          | `audit:BreadcrumbItem/api-behavior`           |
| FR4, AR6         | `Breadcrumbs.test.tsx` separator, mirror-style class, and custom-separator tests | Built-in slash, custom separator                                                           | A contextual separator fails to mirror exactly once or becomes exposed to AT.                       | `audit:BreadcrumbItem/rtl`                    |
| FR5–FR8, AR3–AR5 | `Breadcrumbs.test.tsx` menu suites                                               | String and ReactNode labels, click/keyboard open, rows, selection, Escape, outside dismiss | A menu loses its name/state, focus enters the wrong owner, or dismissal steals valid outside focus. | `audit:BreadcrumbItem/accessibility-behavior` |
| FR9              | `Breadcrumbs.test.tsx` theme-target tests; `themingTargets.test.ts`              | Item, menu trigger, menu surface; default/supporting                                       | A target disappears, moves to non-painting plumbing, or loses variant reflection.                   | `audit:BreadcrumbItem/theming`                |
| AR1–AR2          | `Breadcrumbs.a11y.test.tsx` and `Breadcrumbs.a11y.chromium.spec.ts`              | Trail, explicit current, auto current, opt-out                                             | A role, name, state, or focus expectation regresses.                                                | `audit:BreadcrumbItem/accessibility-behavior` |
| FR10             | `Breadcrumbs.test.tsx` menu-crumb suite (touch and mouse slides)                 | Touch and mouse slides across items                                                        | Removing the adoption fails the slide tests.                                                        | —                                             |

Read from source, with no focused test yet:

- FR1: the item `ref` and other DOM props on the `<li>`.
- FR3: a last crumb with `isCurrent={false}` leaving the trail with no current
  crumb.
- FR4: the built-in slash mirroring exactly once in a right-to-left layout.
- FR5: Enter and Space opening the menu, a click focusing the first row, Tab
  closing the menu, arrows stopping at the ends without wrapping, and typeahead.
- FR7: `onClick` being ignored beside `menu`.
- FR8.
- FR9: the shared focus outline on the link, button, and menu trigger.

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — Conflicting interaction props.** Should the released `menu` + `href` or
  `menu` + `onClick` combinations remain warning-based precedence, or should a
  compatibility plan make them unrepresentable? (`human-api`)
- **OQ2 — Auto-current ownership.** Should omitted `isCurrent` remain an
  auto-detected current candidate, and if so which React-owned mechanism should
  replace post-render DOM reconciliation? (`human-api`)

## Content boundary

This file does not duplicate the consumer prop table, menu-item API, audit scores,
run evidence, screenshots, implementation steps, or shared navigation, layer,
dismissal, and theming rules. It links to their owners.
