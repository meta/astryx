---
schema_version: 1
template_version: 1
kind: family
id: family:buttons
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-04
owners: [cixzhang]
review_triggers: [behavior, layout, theming, accessibility, public-api]
verified_by:
  [
    packages/core/src/Button/Button.test.tsx,
    packages/core/src/IconButton/IconButton.test.tsx,
    packages/core/src/ButtonGroup/ButtonGroup.test.tsx,
    packages/core/src/ToggleButton/ToggleButton.test.tsx,
  ]
members:
  [
    component:Button,
    component:IconButton,
    component:ToggleButton,
    component:ButtonGroup,
    component:ToggleButtonGroup,
  ]
architecture:
  [
    architecture:component-size-cascade,
    architecture:component-theming-surface,
    architecture:public-component-api,
  ]
contributing: []
deciding_specs: [spec:AST-002/DEC-1]
---

# Button family contract

## Intent

People should encounter one coherent button system whether an action is labeled,
icon-only, persistent, standalone, or grouped. Members share the same control
geometry, accessible-name requirement, interaction feedback, asynchronous-action
model, and surface ownership. Each member still owns the semantics specific to a
momentary action, navigation destination, persistent pressed state, or group.

ToggleButton renders Button's elevation state but cannot currently select the
family's resting elevation axis. The family admits that axis for ToggleButton.
Its transparent ghost surface remains a known visual question: elevation may
provide the floating boundary instead of an opaque fill or outline, and this
contract does not require a new background treatment.

## Membership rule

A component belongs when its primary public purpose is to activate a button-like
action, retain a button's pressed action state, or compose those controls into a
button-specific group while preserving their shared surface and interaction
contract.

- **Members:** Button, IconButton, ToggleButton, ButtonGroup, and
  ToggleButtonGroup.
- **Collaborators:** Spinner supplies pending feedback; Tooltip supplies visible
  explanation; LinkProvider supplies Button's navigation renderer; SizeContext
  supplies inherited control size; DropdownMenu may contribute a button trigger
  to ButtonGroup. These collaborators do not become Button-family members.
- **Excluded:** Link's primary purpose is navigation rather than a button surface.
  Switch, CheckboxInput, and RadioList represent settings or form values rather
  than button actions. SegmentedControl and TabList switch views or destinations
  under their own selection/navigation contracts. Components that merely use a
  Button as a trigger or action slot retain their own family membership.

Membership follows public responsibility, not an import of Button or a rendered
`<button>` element.

## Shared owner

- Button owns the common action surface: native button semantics, focus and press
  feedback, size, visual variant, loading presentation, link mode, and resting
  elevation.
- IconButton is the explicit icon-only projection of Button and inherits that
  surface contract without creating another action model.
- ToggleButton reuses the Button surface and adds a persistent controlled pressed
  state, pressed-state visuals, and an interruptible pressed Action.
- ButtonGroup owns connected action-group geometry, roving focus, inherited size
  and disabled state, and one shared connected elevation.
- ToggleButtonGroup owns single- or multiple-selection state and the layout of
  distinct ToggleButton surfaces. It does not become a connected visual surface
  merely because it groups selection.
- Shared primitives retain their own contracts. Spinner, Tooltip, Icon, Link, and
  DropdownMenu behavior does not become Button-specific when composed into a
  member.

## Canonical concepts

| Concept          | Values or states                                                        | Default semantics                                                                                                                                                                                                                                | Stability                                           |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| activation model | momentary action, navigation, persistent press                          | Button and IconButton activate once; ToggleButton represents retained pressed state                                                                                                                                                              | shipped distinction                                 |
| content mode     | visible label, custom visible content, icon-only                        | every control has a required accessible `label`; icon-only hides it visually                                                                                                                                                                     | shipped family rule                                 |
| size             | `sm`, `md`, `lg`                                                        | `md`; explicit member size wins over an inherited group size                                                                                                                                                                                     | shipped family axis                                 |
| visual state     | rest, hover, focus, active, disabled, loading; pressed where applicable | states preserve control geometry and accessible purpose; press feedback follows `spec:AST-094` FR11's control profile under a finger and its fine-pointer profile under a mouse or a pen (not implemented: a mouse press still paints `:active`) | shipped family rule                                 |
| async action     | absent, fire-once, interruptible persistent action                      | ordinary actions deduplicate while pending; persistent toggles remain reversible                                                                                                                                                                 | shipped family distinction                          |
| elevation        | `none`, `low`, `med`, `high`                                            | `none`; the element painting the visible surface owns the shadow                                                                                                                                                                                 | shipped family axis; ToggleButton adoption approved |
| grouping         | standalone, spaced set, connected surface                               | semantics and painted containment decide ownership; grouping alone does not                                                                                                                                                                      | family rule                                         |

## Cross-component invariants

- **FR1 — Every control has an accessible name.** A Button-family control MUST
  receive a non-empty accessible `label`. A text control renders that label or
  caller-provided visible content. An icon-only control exposes the label through
  `aria-label`; its icon does not substitute for a programmatic name.
- **FR2 — Native action semantics are the default.** A momentary or persistent
  action renders an operable button with keyboard activation, focus-visible
  feedback, and `type="button"` unless the component's documented form mode says
  otherwise. Button's `href` mode is the explicit navigation variation and also
  follows `family:navigation-destinations`.
- **FR3 — Disabled means non-operable.** A disabled member MUST NOT invoke its
  callback or Action. Disabled members stay focusable and follow
  `spec:AST-085`. A group disabled state overrides member availability.
- **FR4 — Pending feedback preserves purpose and geometry.** Where a member
  exposes loading or an Action, pending work MUST set `aria-busy`, keep the
  control's dimensions stable, and present a Spinner without changing the
  accessible purpose. Explicit disabled styling and pending styling remain
  distinct.
- **FR5 — Callback and Action order is consistent.** Where a member exposes both
  a synchronous callback and an Action, the callback runs first. Preventing that
  event prevents the Action. Standalone ToggleButton runs `onPressedChange`
  synchronously before `pressedChangeAction` and skips the Action when the callback
  calls `preventDefault()`. The Action also runs when no callback is supplied.
  A caller `onClick` on a standalone ToggleButton runs before `onPressedChange`
  and `pressedChangeAction`. When that `onClick` calls `preventDefault()`, the
  activation requests no next state and neither runs; otherwise the toggle
  proceeds. A caller `onClick` never replaces the toggle request.
  Without `pressedChangeAction`, callback-only activation MUST remain synchronous
  and report no Action-pending feedback. A fire-once action deduplicates activation
  while pending; an explicitly interruptible persistent action may accept a new
  activation and replace the in-flight intent.
- **FR6 — Persistent state is explicit and reversible.** A ToggleButton MUST
  expose its effective state with `aria-pressed` and request the next controlled
  value on activation. Pending state may be optimistic, but a new activation MUST
  derive from the effective in-flight value rather than a stale committed value.
- **FR7 — Shared size preserves family geometry.** Members using the family size
  axis MUST map `sm`, `md`, and `lg` to the same control-height contract. An
  icon-only member is square at the resolved size. Button and IconButton MUST
  default an Astryx Icon in their owned icon slot to `sm` for `sm` and `md`
  controls and to `md` for `lg` controls; an explicit Icon size MUST win. Label
  weight, pressed state, loading, or icon replacement MUST NOT change the outer
  control dimensions.
- **FR8 — Elevation belongs to the painted surface.** A standalone member that
  paints its visible surface owns its resting elevation. A connected group that
  paints one continuous surface owns one shared elevation and its members paint
  effective elevation `none`. A semantic or layout group that paints no shared
  surface MUST NOT acquire elevation solely because it contains buttons.
- **FR9 — Elevation is independent from interaction state.** Pressed, hover,
  focus, active, loading, disabled, and icon states MUST NOT change the owner or
  tier of elevation. They may change the treatment painted on that surface.
- **FR10 — Public, rendered, and theming states agree.** When a member exposes a
  family visual axis, its public prop, effective rendered `data-*` state, and
  documented theme visual prop MUST describe the value it actually paints. A
  wrapper MUST NOT report an ignored child value as effective output.
- **FR11 — A button-specific group has one accessible owner.** ButtonGroup and
  ToggleButtonGroup MUST expose an accessible group label and propagate their
  documented size and disabled defaults without removing a member's accessible
  name. The group owns only the behavior and surface declared by its group mode.
  A ToggleButtonGroup member identified by `value` MUST derive pressed state and
  selection requests from the group, not its standalone `isPressed`,
  `onPressedChange`, or `pressedChangeAction`. Member `onPressedChange` and
  `pressedChangeAction` are ignored. Member activation MUST NOT start a member
  Action or report member Action-pending feedback.
- **FR12 — Connected and spaced groups stay distinct.** ButtonGroup's connected
  presentation removes inter-member gaps, shares outer edges, owns one elevation,
  and uses its documented roving-focus keyboard model. The current
  ToggleButtonGroup keeps distinct child surfaces separated by a gap; each child
  may own its own elevation, and the wrapper owns no shadow. A future connected
  toggle presentation MUST move elevation to the group and make members flat.

## Allowed component variation

- **AV1 — Momentary versus persistent action.** Button and IconButton do not
  retain pressed state. ToggleButton owns `isPressed`, `onPressedChange`,
  `pressedChangeAction`, and pressed-state presentation.
- **AV2 — Visible versus icon-only content.** Button may render a visible label,
  custom visible content, a leading icon, and end content. IconButton always
  renders one required icon with no visible label. ToggleButton may use either
  visible or icon-only content and may replace its icon when pressed.
- **AV3 — Visual emphasis.** Button and IconButton expose the Button variant map.
  ToggleButton owns its selected/depressed treatment instead of inventing a
  momentary-action hierarchy. Themes may vary appearance without changing these
  semantics.
- **AV4 — Navigation.** Button and IconButton may render as links when `href` is
  supplied. ToggleButton remains an action with `aria-pressed`; navigation backed
  by its Action does not turn the control into a destination link.
- **AV5 — Group keyboard model.** ButtonGroup may use roving focus for a connected
  action cluster. ToggleButtonGroup retains the keyboard and selection behavior
  documented for its pressed-button set. Visual similarity alone does not require
  both groups to use the same composite-widget model.
- **AV6 — Tooltip ownership.** A component may require an explicit tooltip or
  provide a documented automatic tooltip for icon-only use. The accessible label
  remains required either way.

## Representative matrix

| Member and state                                   | Shared invariant                                                   | Deliberate variation                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `component:Button` / ordinary action               | named, sized, focusable action surface; fire-once pending behavior | visible content, variants, form type, and optional link mode            |
| `component:IconButton` / compact action or FAB     | Button behavior, square geometry, family elevation                 | required icon; label is programmatic rather than visible                |
| `component:ToggleButton` / pressed and unpressed   | Button geometry, naming, focus, pending, and surface ownership     | controlled `aria-pressed`, pressed icon/treatment, interruptible Action |
| `component:ButtonGroup` / horizontal or vertical   | labeled group; inherited size/disabled state                       | connected edges, one shared elevation, roving focus                     |
| `component:ToggleButtonGroup` / single or multiple | labeled group; inherited size/disabled state                       | selection owner; spaced child surfaces; no wrapper elevation            |
| future connected toggle group                      | labeled selection group and pressed semantics                      | one painted group surface owns elevation; members paint none            |

## Adoption and exceptions

| Component                     | Current adoption                                                                       | Gap or exception                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `component:Button`            | owns the shared surface, size, state, Action, link, and elevation mechanisms           | link mode additionally follows `family:navigation-destinations`                               |
| `component:IconButton`        | inherits Button props and always selects icon-only presentation                        | tooltip remains explicit consumer guidance                                                    |
| `component:ToggleButton`      | inherits Button geometry, focus, pending presentation, and rendered elevation state    | approved adoption gap: add the existing optional `elevation` prop and matching theme metadata |
| `component:ButtonGroup`       | connected surface, inherited size/disabled state, shared elevation, and roving focus   | member elevation is intentionally suppressed while connected                                  |
| `component:ToggleButtonGroup` | controlled single/multiple selection, inherited size/disabled state, and spaced layout | wrapper is not a painted surface and therefore exposes no family elevation                    |

ToggleButton elevation is an approved implementation gap. Adding the existing
optional `Elevation` axis restores family parity without changing no-prop
rendering. Its current transparent surface is accepted without claiming the
transparency question is solved; the shadow may provide the floating boundary,
and any later fill or outline treatment requires separate visual review.

## Verification map

| Contract  | Verification                                                                                                                                          | Representative members and states                                                                              | Mutation or failure expectation                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| FR1–FR3   | role/name, keyboard, callback, disabled, and disabled-reason tests; native-disabled assertions pending conformance (`spec:AST-085`)                   | text Button, IconButton, ToggleButton, link mode, member/group disabled                                        | a member loses its name, keyboard path, or invokes while disabled                                |
| FR4–FR6   | `ToggleButton.test.tsx`: callback/Action order and cancellation, callback-only no-pending path, Action-only settlement, and optimistic re-click tests | standalone ToggleButton with either/both callbacks; Button fire-once Action                                    | callback is dropped, an empty Action reports busy, cancellation is bypassed, or stale state wins |
| FR7       | unit plus real-browser geometry checks                                                                                                                | all sizes; text/icon-only; pressed/unpressed; loading                                                          | family heights diverge, icon-only stops being square, or state shifts outer size                 |
| FR8–FR10  | data attribute, theme metadata, and computed-shadow tests                                                                                             | standalone Button/IconButton/ToggleButton; connected and spaced groups; every elevation tier                   | shadow lands on the wrong box, state changes depth, or public/theme/rendered values disagree     |
| FR11–FR12 | group semantics, propagation, DOM, keyboard, and rendered-surface tests; `ToggleButton.test.tsx` group ownership cases                                | single/multiple selection with member callbacks/Actions and delayed parent acceptance; connected/spaced groups | member callback or Action competes with group state, or surface ownership is conflated           |

## Decision links

- `spec:AST-002/DEC-1` — public API admission is explicit and evidence-backed.
- `family:navigation-destinations` — Button link mode retains the shared
  navigation safety contract.

## Open questions

None.

## Content boundary

This file owns only cross-component Button-family behavior. Component-specific
prop tables, callback payload types, selection algorithms, variants, tooltip
policy, group layouts, implementation mechanisms, current audit results, and
product-specific action hierarchy remain with their component, architecture,
design, audit, or callsite owners.
