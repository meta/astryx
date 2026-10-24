---
schema_version: 3
template_version: 7
kind: component
id: component:ComplexSelector
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/ComplexSelector/ComplexSelector.test.tsx,
    packages/core/src/ComplexSelector/__tests__/ComplexSelector.a11y.chromium.spec.ts,
    apps/storybook/stories/ComplexSelector.stories.tsx,
    apps/storybook/rtl-audit/targets.json,
    packages/core/src/Field/Field.test.tsx,
    packages/core/src/Icon/Icon.test.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:input-fields, family:overlay-dismissal]
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:layer-runtime,
  ]
contributing: []
system_specs: [spec:AST-055, spec:AST-079/DEC-1, spec:AST-085]
---

# ComplexSelector component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | The trigger plays the combobox role on both paths (DEC-1), and `ComplexSelectorRenderTriggerProps` carries `role`, `aria-label`, `aria-required`, and `aria-disabled` beside its existing ref, id, handlers, and popup props. Current source exports one controlled rich-selector shell, its public props and supporting types, an imperative handle, a content render function, an optional `renderTrigger` seam governed by `spec:AST-055`, and named `container*`/`control*` styling targets in place of root styling props. |
| Behavior                | The built-in path composes Field, one combobox trigger whose popup is a dialog, an indicator, and a mounted dialog popup. The caller-rendered path replaces the Field and built-in trigger chrome with one unwrapped caller control that carries the same combobox role and state, while ComplexSelector keeps anchoring, open state, popup wiring, focus return, and the popup.                                                                                                                                                |
| End-user impact         | People selecting through rich custom content receive one named combobox trigger that announces required, busy, and disabled state (and invalid state on the built-in trigger), keyboard and pointer opening, focus restoration, and a popup that remains reachable across logical placement and viewport direction.                                                                                                                                                                                                             |
| Builder impact          | Builders provide controlled value plus custom dialog content. They may use the built-in field trigger, call the imperative handle, or spread one exported trigger-props object onto a caller-rendered control, which then becomes the selector's combobox field. Test code that finds the trigger with `getByRole('button')` uses `getByRole('combobox')`.                                                                                                                                                                      |
| Compatibility/readiness | The built-in Field composition is preserved when `renderTrigger` is absent, and the trigger plays the combobox role on both paths (DEC-1). Caller-rendered mode is additive and implemented under current `spec:AST-055`. This record stays a draft until an owner approves it.                                                                                                                                                                                                                                                 |
| Review checks           | Reject a second or wrapped interactive trigger, a trigger role other than combobox, ARIA the combobox role does not support, missing popup or disabled state, lost focus return, a popup anchored to a different box or outside the inline viewport, suppressed BaseProps, physical-direction placement, or a status that loses its semantic message.                                                                                                                                                                           |
| Governing rules         | `spec:AST-055/FR1–FR7, AR1–AR4`; `architecture:public-component-api/INV1, INV3, INV5–INV9`; `family:input-fields/FR1–FR8, FR10`; `spec:AST-085/FR1, FR2, FR4`; `spec:AST-079/DEC-1`; `family:overlay-dismissal`; `architecture:component-theming-surface`; `architecture:layer-runtime`.                                                                                                                                                                                                                                        |

This table is a review projection; the body below is authoritative.

## Intent

ComplexSelector is a controlled selector shell for choices whose accessible
interaction structure is richer than a single list of options. It owns the
field trigger or caller-rendered anchor, dialog popup, open and close lifecycle,
focus return, optimistic value handoff, and shared field semantics. The caller
owns the accessible structure and selection interaction rendered inside the
popup.

## Compatibility and migration

- Released default preserved: `no`; the trigger's role is combobox
- Compatibility class: accessibility correction; omitting `renderTrigger` preserves the built-in Field, DOM structure, targets, and interaction
- Controlled/uncontrolled behavior: controlled only; the caller owns `value`, while ComplexSelector supplies the committing helper
- Migration decision: test code that finds the trigger with `getByRole('button')` uses `getByRole('combobox')`; no runtime migration

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The built-in Field composition, one combobox trigger, loading and disclosure end controls, and the current `complex-selector` target.
- Popup visibility, the anchor relationship, logical placement and alignment, focus return, and `onOpenChange` notification.
- The optimistic value and busy state exposed to caller-provided content while `changeAction` is pending.
- The `renderTrigger` integration local to ComplexSelector: dialog naming, click and ArrowDown opening, focus return, and the current handed-back props object.
- The trailing indicator and popup surfaces exposed by the current `complex-selector-indicator-icon` and `complex-selector-popup` targets.

**Does not own / non-goals**

- The accessible role, keyboard model, and selection behavior inside `children` — owned by the product callsite and the primitives it composes.
- Shared Field label, description, requirement, validation, and status rendering — owned by `component:Field` and `family:input-fields`.
- General Icon rendering for semantic names and icon component types — owned by `component:Icon`.
- Arbitrary ReactNode content supplied through `startIcon` — owned by the product callsite.
- Shared layer hosting, positioning, native light dismissal, and Escape ordering — owned by `architecture:layer-runtime` and `family:overlay-dismissal`.
- The cross-component caller-rendered-trigger API grammar — owned by `spec:AST-055`.

## Public concepts

| Concept                 | Closed values or states                                                                    | Meaning                                                                                               | Availability by variant/orientation/state                                                          | Default                                                  | Owner                        | Stability | Invalid-value behavior                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| controlled selection    | caller value; optimistic candidate value                                                   | Current value passed to `children`; commits call `onChange` and optional `changeAction`               | all paths                                                                                          | caller's `value`                                         | `component:ComplexSelector`  | stable    | no uncontrolled fallback                                                                                                     |
| content render state    | open/closed; idle/busy; trigger id; content id                                             | Lets caller content observe shell state without owning visibility                                     | all paths                                                                                          | closed and idle                                          | `component:ComplexSelector`  | stable    | current shell state is supplied on every render                                                                              |
| trigger ownership       | built-in; caller-rendered                                                                  | Chooses whether ComplexSelector renders Field/combobox chrome or renders one caller control unwrapped | caller-rendered when `renderTrigger` is present                                                    | built-in                                                 | `spec:AST-055`               | stable    | caller-rendered path wins; built-in chrome is absent                                                                         |
| built-in variant        | `input`; `secondary`; `ghost`                                                              | Bordered field, secondary-button, or ghost-button trigger representation                              | built-in path only                                                                                 | `input`                                                  | `component:ComplexSelector`  | stable    | unsupported values are rejected by TypeScript                                                                                |
| built-in size           | `sm`; `md`; `lg`                                                                           | Resolves trigger height through shared element-size tokens                                            | built-in path only                                                                                 | `md`                                                     | `component:ComplexSelector`  | stable    | unsupported values are rejected by TypeScript                                                                                |
| start content           | absent; semantic icon name; icon component type; arbitrary ReactNode                       | Optional leading trigger content                                                                      | built-in path only                                                                                 | absent                                                   | `component:ComplexSelector`  | stable    | icon-capable values delegate to Icon; arbitrary content renders directly                                                     |
| field metadata          | visible/hidden label; description absent/present; optional/required/neither; tooltip       | Supplies built-in Field naming and supporting information                                             | built-in path; required state also reaches a caller-rendered control                               | visible label; neither required                          | `family:input-fields`        | stable    | `isRequired` and `isOptional` resolve to one required state on the combobox                                                  |
| availability            | enabled; disabled                                                                          | Disabled blocks click, ArrowDown, and imperative opening                                              | `aria-disabled` with a kept tab stop on both paths                                                 | enabled                                                  | `component:ComplexSelector`  | stable    | disabled guards every opening route and press on both paths                                                                  |
| busy                    | idle; external loading; pending Action                                                     | Exposes `aria-busy`, a built-in Spinner, and `isBusy` to content                                      | Spinner only on built-in path; state remains available to content                                  | idle                                                     | `family:input-fields`        | stable    | external and transition busy resolve to one state                                                                            |
| validation              | absent; warning; error; success                                                            | Supplies Field status; error also exposes invalid state on the built-in trigger                       | built-in path only                                                                                 | absent                                                   | `family:input-fields`        | stable    | unsupported values are rejected by TypeScript                                                                                |
| status placement        | `attached`; `detached`; `tooltip`                                                          | Chooses Field status presentation                                                                     | built-in path only; secondary and ghost map attached to detached                                   | `attached` for input; `detached` for secondary and ghost | `family:input-fields`        | stable    | a secondary or ghost attached request resolves to detached                                                                   |
| popup placement         | `above`; `below`; `start`; `end`                                                           | Logical side where the popup is requested                                                             | all paths; layer runtime may choose a fallback                                                     | `below`                                                  | `architecture:layer-runtime` | stable    | unsupported values are rejected by TypeScript                                                                                |
| popup alignment         | `start`; `center`; `end`                                                                   | Logical alignment along the placement axis                                                            | all paths                                                                                          | `start`                                                  | `architecture:layer-runtime` | stable    | unsupported values are rejected by TypeScript                                                                                |
| visibility control      | trigger actions; content `close`; imperative `open`/`close`/`toggle`; observation callback | Keeps one component-owned visibility state and reports every transition                               | all paths                                                                                          | closed                                                   | `component:ComplexSelector`  | stable    | disabled guards opening; closing an already closed popup is a no-op                                                          |
| caller DOM/style inputs | inherited BaseProps supplied or omitted; `container*` and `control*` part styles           | DOM, data, ARIA, and event inputs accepted by ComplexSelector, plus named part styling                | BaseProps reach the primary semantic control on both paths; part styles apply on the built-in path | omitted                                                  | `family:input-fields`        | stable    | root `xstyle`/`className`/`style` are a type error; part styles under `renderTrigger` have no effect and warn in development |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                                                                         | Draft review state                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| FR1  | ComplexSelector MUST remain controlled: `children` receives the current or optimistic value, a committing helper, a closing helper, and live shell state; the committing helper calls `onChange` before an optional `changeAction`.                                                                                                                                                                                                                  | Current source, tests, `family:input-fields/FR6`                              | Verified current behavior                                                                 |
| FR2  | The built-in path MUST render Field, one combobox trigger whose popup is a dialog, an optional start slot, a disclosure/loading end area, and one mounted popup. The popup is hidden while closed and shown while open.                                                                                                                                                                                                                              | Current source, docs, tests, `architecture:layer-runtime`                     | Verified current behavior                                                                 |
| FR3  | The built-in trigger MUST resolve `sm`, `md`, and `lg` from shared element-size tokens. Input, secondary, and ghost variants MUST preserve the same open, close, value, busy, and popup behavior.                                                                                                                                                                                                                                                    | Current source, docs, tests, `family:input-fields`                            | Verified current behavior                                                                 |
| FR4  | Built-in Field metadata MUST name and describe the combobox trigger and preserve description, status, validation, and requirement semantics; required state reaches the trigger as `aria-required`, which the combobox role supports.                                                                                                                                                                                                                | Current source, Field contract, DEC-1, WCAG 2.2 4.1.2                         | Verified current behavior                                                                 |
| FR5  | Explicit disabled MUST expose `aria-disabled` on the trigger, built-in or caller-rendered, while it keeps its tab stop, and MUST make click, ArrowDown, imperative `open`, and imperative `toggle` no-ops; a press on a disabled trigger reaches no handler.                                                                                                                                                                                         | Current source, tests, `spec:AST-085/FR1, FR2, FR4`                           | Verified current behavior                                                                 |
| FR6  | External `isLoading` or a pending `changeAction` MUST resolve to one busy state. The built-in path renders one decorative Spinner, exposes `aria-busy`, and announces the busy start once; caller content receives `isBusy`; caller-rendered mode receives current `aria-busy`.                                                                                                                                                                      | Current source, docs, tests, `family:input-fields/FR5–FR6`                    | Verified current behavior                                                                 |
| FR7  | Warning, error, and success MUST delegate to Field status. Error MUST expose `aria-invalid` on the built-in trigger. Secondary and ghost with requested attached status MUST resolve to detached status.                                                                                                                                                                                                                                             | Current source, tests, `family:input-fields/FR8`                              | Verified current behavior                                                                 |
| FR8  | Trigger click toggles the popup; ArrowDown opens a closed popup; content and the imperative handle can close it; every open/close route reports through `onOpenChange`; closing returns focus to the current trigger.                                                                                                                                                                                                                                | Current source, tests, `family:overlay-dismissal`                             | Verified current behavior                                                                 |
| FR9  | Placement and alignment MUST remain logical. The popup MUST anchor to the current trigger and keep content reachable through the current layer-runtime fallback and scroll behavior.                                                                                                                                                                                                                                                                 | Current source, RTL target, browser test, layer architecture, WCAG 2.2 1.4.10 | Verification requires passing logical RTL placement and exact-head 320px browser receipts |
| FR10 | With `renderTrigger`, the caller control MUST render unwrapped as the only opener, replace Field and built-in chrome, and carry the exported ref, handlers, combobox role, popup props (`aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`), name, busy, required, and disabled state, plus the caller's inherited BaseProps. It anchors the popup, receives focus return, and preserves the same content, handle, and open-change behavior. | `spec:AST-055/FR1–FR7, AR1–AR4`, DEC-1, current source and tests              | Verified current behavior                                                                 |
| FR11 | The trigger MUST play the combobox role on both paths so every emitted ARIA state is supported, and accepted BaseProps plus component availability state MUST NOT disappear silently when trigger ownership changes.                                                                                                                                                                                                                                 | DEC-1, `architecture:public-component-api/INV3, INV5–INV7`, WCAG 2.2 4.1.2    | Verified current behavior                                                                 |
| FR12 | Built-in Trigger, Indicator icon, and Popup MUST carry the local `complex-selector`, `complex-selector-indicator-icon`, and `complex-selector-popup` targets on their painting elements. Delegated and caller-owned content MUST keep its existing owner.                                                                                                                                                                                            | Current source, docs, theming architecture, target tests                      | Verified current behavior                                                                 |

### Allowed variation

- **AV1 — Popup content.** Caller-provided content may use any accessible selection structure without becoming ComplexSelector-owned anatomy.
- **AV2 — Start content.** Semantic icon names and icon component types render through Icon; arbitrary ReactNode content remains caller-owned.
- **AV3 — Trigger element.** Caller-rendered mode does not require a particular tag or Astryx component when the returned control can take focus and accept the supplied integration props.
- **AV4 — Layer fallback.** The current layer runtime may flip or constrain the requested placement to keep the popup reachable.
- **AV5 — Status content.** A status message may be absent; when present, Field owns its semantic presentation.

### Representative states

| State                            | Required invariant                                                                                     | Allowed variation                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| built-in empty/selected/overflow | Field and trigger stay bounded; placeholder/value remains named; long content does not widen the field | Caller-owned value content may differ                                |
| input/secondary/ghost × sm/md/lg | Size tokens and shell behavior remain coherent                                                         | Secondary and ghost take their button treatments                     |
| disabled                         | Built-in trigger exposes `aria-disabled`, keeps its tab stop, and no open path succeeds                | The caller-rendered control carries the same state                   |
| external/transition busy         | One busy state reaches ARIA and content; built-in dimensions remain stable                             | Busy source may be `isLoading` or a pending Action                   |
| warning/error/success            | Field owns status; error exposes invalid state                                                         | Message may be absent                                                |
| closed/open                      | One popup remains anchored; disclosure state and focus return remain correct                           | Requested logical placement/alignment may differ                     |
| caller-rendered closed/open      | One unwrapped caller control owns paint and focus; ComplexSelector owns behavior and popup             | Caller chooses the control's element and representation              |
| LTR/RTL and wide/320px           | Logical alignment mirrors and no required control becomes unreachable                                  | Layer fallback side and popup height may differ with available space |

### Transformation and precedence order

- **ORD1 — Trigger content.** `triggerLabel` resolves before caller `placeholder`, which resolves before the translated selector placeholder.
- **ORD2 — Required semantics.** Shared required resolution combines `isRequired` and `isOptional`; the resulting `aria-required` reaches the combobox trigger on both paths.
- **ORD3 — Status placement.** Secondary and ghost convert requested/default attached status to detached before Field renders it; the input variant keeps the requested placement.
- **ORD4 — Value Action.** The commit helper calls `onChange`, then starts the optional transition, exposes the optimistic value, and awaits `changeAction` while the shared busy state is true.
- **ORD5 — Trigger ownership.** Presence of `renderTrigger` selects caller-rendered mode before built-in Field/trigger output; both open the same popup and use the same content and imperative handle.
- **ORD6 — DOM/style/event precedence.** On both paths, inherited BaseProps reach the primary semantic control and the component's own trigger wiring wins over them. On the built-in path, a consumer `onClick` runs before the toggle and can cancel it, a consumer `onKeyDown` runs after the built-in key handling, `container*` styles the Field box, and `control*` styles the control box. On the caller-rendered path, consumer handlers run after the built-in handling and cannot cancel opening, and `container*`/`control*` have no effect.

### Performance and resources

- **PR1 — One layer owner.** Both trigger paths share one Popover instance and one mounted popup rather than duplicating layer state or listeners.
- **PR2 — Optimistic state.** The component derives busy state from React transition state and external loading without mirroring it through Effects.

Current measurements belong in the audit record; this subsection owns only
durable constraints and their verification target.

## Accessibility contract

- **AR1 — Built-in name and state.** The trigger plays the combobox role, receives its accessible name from Field, and exposes its dialog popup (`aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`), required and invalid state, description/status references, busy state, and disabled state through `aria-disabled` while it keeps its tab stop.
- **AR2 — Caller-rendered field.** The handed-back trigger props carry the anchor ref, id, click and ArrowDown handlers, `role="combobox"`, `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`, `aria-busy`, `aria-required`, and `aria-disabled`, and name the control with `label` unless the selector was given `aria-label` or `aria-labelledby`, because a combobox takes no name from its content; the caller control renders unwrapped as the only opener.
- **AR3 — Focus lifecycle.** The popup autofocuses its content through the Popover owner, and every supported close route returns focus to the current trigger before `onOpenChange(false)` runs.
- **AR4 — Content responsibility.** Caller content supplies the role, name, keyboard model, selected state, and focus navigation appropriate to its own selection pattern.
- **AR5 — Direction and viewport.** Logical placement and alignment mirror with inherited direction, and the scrollable popup content remains reachable at 320 CSS px.
- **AR6 — One trigger role.** Both paths expose the same combobox role with required, busy, and disabled state, so a person hears them whichever control opens the popup. Invalid state reaches the built-in trigger, which renders the status message (FR7).

## Design relationships

| Anatomy or state              | Design requirement                                                         | Representation authority                      | Hierarchy role    | Component contract |
| ----------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- | ----------------- | ------------------ |
| Field                         | Shared input label/support/status shell                                    | `component:Field`, `family:input-fields`      | supporting        | FR2, FR4, FR7      |
| Trigger                       | Bounded value/placeholder surface and opener                               | current component source and consumer docs    | prominent         | FR2–FR5            |
| Icon-rendered start icon      | Optional semantic icon through Icon                                        | `component:Icon`                              | supporting        | FR2, FR12          |
| Caller-rendered start content | Optional arbitrary React content with caller-owned representation          | product callsite                              | context-dependent | FR2, FR12          |
| Busy Spinner                  | Processing representation without changing shell dimensions                | `family:input-fields` and Spinner             | supporting        | FR6                |
| Status                        | Shared warning/error/success representation and message                    | `component:Field`, `family:input-fields`      | supporting        | FR7                |
| Indicator icon                | Disclosure mark whose rotation reflects open/closed state                  | current component source and consumer docs    | supporting        | FR2, FR8, FR12     |
| Popup                         | Painted dialog surface anchored to the trigger                             | `architecture:layer-runtime`                  | prominent         | FR8–FR10           |
| Caller-rendered trigger       | Caller-owned control paint, focus indicator, and open-state representation | `spec:AST-055`; caller selects representation | prominent         | FR10, AR2–AR3      |

The component implements design requirements without copying their rationale.
No component-local subjective design decision is introduced by this draft.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Field": {"delegatesTo": {"owner": "component:Field", "target": "field"}},
  "Trigger": {"target": "complex-selector"},
  "Icon-rendered start icon": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Caller-rendered start content": {
    "none": {
      "reason": "intentional: Arbitrary ReactNode content is caller-owned and receives no ComplexSelector target."
    }
  },
  "Indicator icon": {"target": "complex-selector-indicator-icon"},
  "Popup": {"target": "complex-selector-popup"}
}
```

Busy Spinner and Status are transient/delegated states rather than named anatomy
entries in current consumer docs. Caller-rendered mode replaces Field, Trigger,
start content, busy Spinner, Status, and Indicator icon; the caller's control is
not a ComplexSelector-owned painting surface or theme target.

## Family and system relationships

- `spec:AST-055` owns the cross-component `renderTrigger` shape, one-element integration, disclosure, caller paint, anchoring, focus-return, and real-browser evidence requirements; ComplexSelector supplies the dialog-specific projection.
- `family:input-fields` owns shared field geometry, end-control separation, busy/Action flow, status placement, and FR10 prop targets; ComplexSelector adopts those concepts on the built-in path.
- `spec:AST-085` owns disabled-control focusability and inert presses; ComplexSelector applies it to the built-in trigger.
- `spec:AST-079/DEC-1` owns the shared selector trigger hierarchy that adds the secondary variant.
- `family:overlay-dismissal` owns shared Escape, light-dismiss, and close ordering; ComplexSelector participates through Popover.
- `architecture:public-component-api` owns public export reachability, BaseProps preservation, styling composition, and event composition; DEC-1 keeps the trigger's role and state the same on both paths.
- `architecture:component-theming-surface` owns anatomy qualification, local target mapping, and delegation.
- `architecture:layer-runtime` owns the Popover host, logical position, fallback, native dismissal, and visibility reconciliation.
- Field and Icon retain ownership of their delegated targets and representation.

## Verification map

| Contract            | Verification                                                                                                                  | Representative states                                                         | Mutation or failure expectation                                                                                              | Audit section                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| FR1, FR6            | `ComplexSelector.test.tsx` value/Action tests                                                                                 | controlled value; optimistic pending; external loading                        | Callback order changes, optimistic value disappears, or busy state diverges.                                                 | `audit:ComplexSelector/behavior`       |
| FR2–FR4, FR7, FR12  | component/Field/Icon tests, docs, target guards, audit matrix, and axe report                                                 | input/secondary/ghost; sm/md/lg; empty/value/overflow; required; all statuses | Owned anatomy, target, naming, description, invalid, or status behavior disappears, or unsupported required ARIA is emitted. | `audit:ComplexSelector/anatomy`        |
| FR5, AR1, AR6       | `ComplexSelector.focusableDisabled.test.tsx`, the trigger-semantics suite in `ComplexSelector.test.tsx`, and the audit matrix | enabled/disabled × built-in/caller-rendered                                   | A disabled path opens or reaches a handler, loses its tab stop, or either path drops `aria-disabled`.                        | `audit:ComplexSelector/accessibility`  |
| FR8, AR3            | focused open-change, light-dismiss, Escape, content-close, handle, and focus-return tests                                     | click; ArrowDown; selection; Escape; light dismiss; handle                    | Open/close notification duplicates or disappears, or focus falls to body instead of the trigger.                             | `audit:ComplexSelector/accessibility`  |
| FR9, AR5            | RTL D4 target plus `ComplexSelector.a11y.chromium.spec.ts`                                                                    | LTR/RTL; logical start; wide/320px; layer fallback                            | Popup aligns to the physical wrong side, loses its anchor, overflows horizontally, or becomes unreachable.                   | `audit:ComplexSelector/rtl-responsive` |
| FR10, AR2–AR3       | render-trigger unit suite and exact-head Chromium focus/anchor receipts                                                       | caller button closed/open; focus-visible; LTR/RTL; narrow                     | A second/wrapped opener appears, disclosure is missing, focus paint has no owner box, or popup loses the anchor.             | `audit:ComplexSelector/accessibility`  |
| FR11, ORD6, DEC-1   | trigger-semantics suite, `ComplexSelector.fr10.test.tsx`, and the audit matrix axe report                                     | required, invalid, and disabled states; BaseProps across both trigger paths   | A trigger loses the combobox role, emits ARIA the role does not support, or suppresses accepted inputs.                      | `audit:ComplexSelector/public-api`     |
| Theming anatomy map | `scripts/check-knowledge.mjs` and theming target inventories                                                                  | built-in anatomy; caller-rendered replacement                                 | Missing, extra, stale, or multiply assigned mappings pass validation.                                                        | `audit:ComplexSelector/theming`        |

## Decision log

- **DEC-1 — The trigger is a combobox field.**

  **Decider:** cixzhang, 2026-10-24

  The trigger plays the combobox role, with a dialog popup, on both paths, so
  required and disabled state are valid on it and a caller-rendered control
  announces the same field state as the built-in trigger. Disabled follows
  `spec:AST-085`.

  Rejected: a disclosure button whose API is narrowed to the states a button
  supports, because required is field state the selector already accepts.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, popup internals, or family/system rules. It links
to their owners.
