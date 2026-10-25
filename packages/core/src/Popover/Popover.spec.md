---
schema_version: 3
template_version: 3
kind: component
id: component:Popover
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-07
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Popover/Popover.test.tsx,
    packages/core/src/Popover/Popover.doc.mjs,
    packages/core/src/Popover/usePopover.doc.mjs,
    packages/core/src/hooks/useFocusTrap.test.tsx,
    packages/cli/foundation/discovery/theming-targets.mjs,
    packages/cli/foundation/discovery/theming-targets.test.mjs,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:layer-runtime,
    architecture:public-component-api,
  ]
contributing: []
system_specs: []
---

# Popover component contract

## Intent

Popover presents interactive, caller-supplied content in an anchored top-layer
surface. The component owns the standard trigger-to-surface composition;
`usePopover` exposes the same semantic lifecycle, focus containment, dismissal,
and rendering contract for custom compositions.

This contract records the behavior present after
[PR #5373](https://github.com/facebook/astryx/pull/5373), the Popover target
direction settled by Cindy Zhang on 2026-08-31, the focus/opening correction
approved by Cindy Zhang on 2026-09-07, and the move of viewport fitting to the
layer runtime decided by Cindy Zhang on 2026-10-03 (`spec:AST-059`). Public API signatures and release status
remain unchanged. Consumer syntax and complete signatures remain owned by
`Popover.doc.mjs` and `usePopover.doc.mjs`. The canonical `popover` target is the
only broad Popover surface target.

DEC-4 below (pending owner review) adds one public concept: the surface padding
rung, so a caller whose content owns its own edges can ask for a flush surface.

## Compatibility and migration

- Released default preserved: `yes`
- `presentation` (DEC-6) defaults to `popover`, the released anchored surface;
  `presentation="popover"` is also the value that keeps it wherever a touch
  default would otherwise apply (`architecture:public-component-api` INV16,
  `spec:AST-017` FR3, DEC-23). Popover does not implement `presentation` yet.
- Canonical target: `popover` owns the broad painted-surface contract for
  `<Popover>` and public `usePopover` compositions
- Removed alias: 0.7.0 removes `popover-surface`; themes and CSS selectors migrate
  it to `popover` with `astryx upgrade --from 0.6.3 --apply --path .`
- Composed components: component-specific surface targets such as
  `selector-popup` and `multi-selector-popup` remain authoritative refinements
  beside the broad canonical target
- New hook consumers: a direct `usePopover` composition that needs its own theme
  reachability provides and documents an owned `surfaceTarget`

## Ownership boundary

**Owns**

- The standard trigger or referenced-anchor composition, the painted Popover
  surface, the canonical broad `popover` theme target for that surface, and the
  slot that renders caller-supplied content inside it.
- The public `usePopover` semantic contract: visibility operations, trigger
  bindings, surface rendering, dialog semantics, focus containment, and
  lifecycle notifications.
- Popover-specific focus destination selection, the preferred size (an explicit
  `width`, else the trigger's minimum width), conditional internal scrolling,
  and the measurement lifecycle needed to support them.
- The current fallback close control appended by the hook.

**Does not own / non-goals**

- Trigger presentation and caller content presentation — caller-owned.
- Component-specific surface refinement targets — owned and documented by the
  composed component; Popover supplies only the shared baseline target contract.
- Generic top-layer hosting, native popover lifecycle reconciliation, anchor
  positioning, portal/context selection, and same-gesture reopen protection —
  owned by `architecture:layer-runtime`.
- The viewport inset — the gutter and safe-area insets, the size caps, the
  fallback order including the slide and its anchor-visibility condition, and
  the app-declared inset — owned by `architecture:layer-runtime` through
  `spec:AST-059`. Popover clamps its own preferred size with the runtime's cap
  and adds nothing of its own.
- Shared Escape and platform-close ordering — owned by
  `family:overlay-dismissal`.
- The shared focus-trap algorithm outside Popover-specific destination choice —
  owned by `useFocusTrap`.
- Hover previews and brief helper text — owned by HoverCard and Tooltip.

## Public surface and package boundary

The installable root package and `@astryxdesign/core/Popover` subpath expose the
full Popover public surface. The backward-compatible Layer entry point re-exports
`Popover`, `usePopover`, `UsePopoverOptions`, `UsePopoverReturn`, and
`PopoverProps`; `PopoverTriggerRenderProps` is exposed through the Popover package
surface, not the Layer entry point. There is no installable
`Popover/usePopover` implementation subpath.

## Public concepts

| Concept                      | Closed values or states                                      | Meaning                                                                                                                    | Availability              | Default                                                                      | Owner                                                                               | Stability                      | Invalid or unsupported behavior                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger composition          | Wrapped trigger, render-prop trigger, or referenced anchor   | Supplies the anchor and the control that opens or closes the standard component                                            | Popover                   | Wrapped trigger when children are supplied                                   | `component:Popover`                                                                 | Current public behavior        | A referenced or wrapped anchor without a button or button role warns in development and receives no trigger handler; it does not throw.                    |
| Visibility ownership         | Uncontrolled or externally controlled                        | Chooses whether Popover stores visibility or synchronizes to caller state                                                  | Popover                   | Uncontrolled                                                                 | `component:Popover`                                                                 | Current public behavior        | Controlled changes are synchronized through show/hide; dismissal requests are reported to the caller rather than redefining the external source of truth.  |
| Popup semantics              | Dialog or neutral wrapper                                    | Exposes dialog semantics or lets child menu/listbox semantics own the popup                                                | Popover and hook          | Dialog                                                                       | `component:Popover`                                                                 | Current public behavior        | A dialog without a label warns in development. Neutral mode omits dialog role and modal semantics.                                                         |
| Focus entry                  | Automatic or caller-preserved                                | Focuses genuine caller content, falls back to the labeled dialog surface when none exists, or preserves current focus      | Popover and hook          | Automatic                                                                    | `component:Popover`                                                                 | Current public behavior        | The injected fallback close control is excluded from initial-focus candidates and reveals only when reached sequentially.                                  |
| Dismissal                    | Outside/Escape enabled or disabled within native constraints | Controls light dismiss and explicit Escape participation                                                                   | Popover and hook          | Both enabled                                                                 | `component:Popover`; `family:overlay-dismissal` owns Escape/platform-close ordering | Current public behavior        | Disabling Escape alone cannot override the native Escape behavior of an auto popover; explicit-dismiss behavior requires light dismiss to be disabled too. |
| Presentation                 | `popover`, `bottom-sheet`, or `adaptive`                     | Chooses the surface that holds the content: anchored, a BottomSheet, or a BottomSheet on a compact touch screen            | Popover                   | `popover`                                                                    | `component:Popover`; `component:BottomSheet` owns the sheet                         | Decided (DEC-6)                | —                                                                                                                                                          |
| Surface treatment            | Default surface or caller-owned treatment                    | Applies the shared painted surface and optional consumer styling                                                           | Popover and hook          | Default surface                                                              | `component:Popover`                                                                 | Current public behavior        | Custom styling does not change lifecycle, focus, or dismissal semantics.                                                                                   |
| Surface padding              | A spacing-scale step, `0` through `10`                       | Sets the inset the painted surface keeps around caller content; `0` is a flush surface for content that owns its own edges | Popover and hook          | Popover: step 3; hook: none                                                  | `component:Popover`                                                                 | Pending owner review (DEC-4)   | The rung lands on the painted surface, so a theme's `padding` on the `popover` target replaces it rather than nesting; consumer `xstyle` merges after it.  |
| Surface target ownership     | Shared baseline or component-specific refinement             | Assigns `popover` as the broad surface owner and lets a composed component add its own target on that same element         | Popover and hook          | `popover` baseline; no component-specific refinement                         | `component:Popover`; the composed component owns its refinement target              | Current compatibility contract | `popover-surface` is compatibility output, not a new target for consumers or a second anatomy owner.                                                       |
| Placement and preferred size | Logical placement/alignment plus preferred width             | Positions the anchor surface and states the size Popover prefers; the layer runtime fits it to the viewport                | Popover and hook renderer | Below/start; Popover matches trigger minimum width when no width is supplied | `component:Popover` for the preference; `architecture:layer-runtime` for the fit    | Current public behavior        | An explicit width renders at its size up to the viewport minus gutters; it is never shrunk to the room beside the trigger (`spec:AST-059` FR2).            |

### Public `usePopover` semantic inputs

Consumer syntax, exact names, and types remain in `usePopover.doc.mjs`; this
table owns their semantic effect.

| Input concept                     | Default                          | Effect and lifetime                                                                                                                                                                                              | Invalid or unsupported behavior                                                                                          |
| --------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Show and hide notifications       | Absent                           | Fire after the hook updates its visibility for an imperative or reconciled browser transition. They remain active for the mounted hook instance.                                                                 | No callback is fired when no transition occurs. Callers own any focus return they add in a hide notification.            |
| Surface styling                   | No consumer override             | Merges consumer StyleX, class, and inline styles onto the painted surface for every rendered lifetime.                                                                                                           | Styling cannot move ownership to the positioned outer layer; positioning styles belong to the renderer's layer props.    |
| Light and Escape dismissal        | Enabled                          | Escape dismissal registers through the focus trap when enabled; outside light dismiss uses native `popover="auto"` and is not shared-stack coordinated.                                                          | Escape disablement is only complete when native light dismiss is also disabled.                                          |
| Automatic focus                   | Enabled                          | Focuses the first genuine caller content control for each accepted opening unless that opening requests preservation; a dialog with none falls back to its surface.                                              | The injected fallback close control is never an initial-focus candidate.                                                 |
| Fallback close control and label  | Included; “Close popover”        | Appends an end-of-trap close control for each rendered surface.                                                                                                                                                  | When omitted, the hook does not synthesize another close affordance.                                                     |
| Popup role, label, and modality   | Dialog, modal, no implicit label | Stamps semantics on the painted surface for its rendered lifetime.                                                                                                                                               | Neutral role suppresses dialog and modal semantics. Missing dialog label warns in development rather than throwing.      |
| Default surface                   | Enabled                          | Applies the shared background, radius, and elevation treatment while rendered.                                                                                                                                   | Turning it off delegates painting to caller content but does not turn `usePopover` into a different lifecycle primitive. |
| Surface padding                   | None                             | Applies one spacing-scale rung on every edge of the painted surface while rendered. `Popover` passes its own default of 3; a direct hook composition paints no padding unless it asks for a rung.                | The rung is not a container-protocol enrollment: the surface publishes no edge geometry to its content.                  |
| Optional component surface target | No component-specific refinement | Adds a component-owned refinement target beside the canonical `popover` target on the same rendered surface. New direct hook consumers provide and document one only when they need distinct theme reachability. | `surfaceTarget` does not create another surface or owner. Do not pass or depend on deprecated `popover-surface`.         |

### Public `usePopover` semantic outputs

| Output concept        | Meaning and lifetime                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger binding       | A ref binding establishes the anchor while attached; ARIA trigger state tracks the current role and open state; a stable anchor identifier supports advanced composition. Detaching the trigger removes its anchor association. |
| Visibility operations | `show`, `hide`, and `toggle` are the canonical operations for the mounted hook instance. Public signatures remain unchanged, and every opening path inherits same-gesture reopen protection.                                    |
| Open state            | Reflects the hook's reconciled visibility. Browser-initiated close is observed on the queued native toggle event, so DOM visibility may lead React state briefly.                                                               |
| Surface binding       | A content ref identifies the focus-trap surface while mounted.                                                                                                                                                                  |
| Renderer              | Produces the positioned layer and painted surface around caller content, including focus containment and the optional fallback close control. The renderer must remain in the React tree for the surface to exist.              |
| Surface identifier    | A stable identifier connects the trigger's control relationship to the rendered surface for the hook instance.                                                                                                                  |

### Side effects and lifetime

- Attaching the trigger ref assigns and removes the CSS anchor name used by the
  Layer runtime.
- Every opening path applies same-gesture reopen protection before changing
  visibility. A rejected opening does not invoke `onShow`.
- Successful visibility operations call the browser popover methods when
  available, update hook state, and invoke the corresponding lifecycle
  notification. Native close events reconcile back into that same state model.
- The default context layer keeps its mounted host while closed after initial
  resolution; open state, not host existence, controls visibility. Lazy mounting
  remains a Layer-level option rather than a separate Popover contract.
- Popover component trigger handlers and ARIA state exist only while the trigger
  is mounted and enabled. Disabling Popover ignores its trigger interaction; it
  does not disable the caller's trigger element.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                        | Basis                                                                                                 | Acceptance and implementation state                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| FR1 | Popover and public `usePopover` expose one visibility lifecycle with canonical show, hide, and toggle operations. Every opening path inherits same-gesture reopen protection without changing public signatures.                                                                                                 | Current public package surface, `architecture:layer-runtime/INV7`, and owner approval on 2026-09-07   | Accepted; implemented and covered by focused Popover-family tests                           |
| FR2 | Popover derives semantic focus entry identically across activation modalities: first genuine caller content, then labeled dialog-surface fallback. The injected close control is excluded. Shared interaction modality controls focus indication, not destination.                                               | PR #5373, `architecture:interaction-modality`, and owner approval on 2026-09-07                       | Accepted; implemented and covered by Popover focus tests                                    |
| FR3 | Retired. Viewport and safe-area capping is the layer runtime's (`spec:AST-059` FR2, FR3); Popover clamps its preferred size with the runtime's cap and caps its painted surface with the same definition.                                                                                                        | `spec:AST-059`, owner direction 2026-10-03                                                            | Retired; see `architecture:layer-runtime` INV11 and the `Core/Layer` viewport-inset stories |
| FR4 | Popover enables internal scrolling only after measured overflow exceeds the current tolerance. Fitting content does not become a scroll container.                                                                                                                                                               | PR #5373 and current tests                                                                            | Verified current behavior                                                                   |
| FR5 | Overflow signals while open coalesce into at most one measurement per animation frame, and Popover owns no measurement observers while closed.                                                                                                                                                                   | PR #5373 and current tests                                                                            | Verified current resource behavior                                                          |
| FR6 | Component anatomy contains the caller trigger and content, one painted Popover surface, and the optional fallback close control. Popover owns no Header, Body, or separate shared-hook surface part.                                                                                                             | Current source, docs target inventory, and tests                                                      | Accepted anatomy; stale consumer anatomy corrected by this contract                         |
| FR7 | The painted surface has one broad canonical target, `popover`; composed components may add one authoritative component-specific refinement target.                                                                                                                                                               | Owner direction on 2026-08-31 plus current target inventory                                           | Accepted canonical contract; covered by focused target tests                                |
| FR8 | The surface padding is one spacing-scale rung applied on the painted surface. Popover defaults to step 3 (the released inset); `0` paints a flush surface; a direct `usePopover` composition paints none unless it asks for a rung. The rung sits where a theme's `padding` on the `popover` target replaces it. | PR #6683 and its Popover tests; `architecture:container-padding/INV8` (padding alone does not enroll) | Pending owner review (DEC-4); implemented and covered by the Popover surface-padding suite  |
| FR9 | Under a finger, Popover grows out of its trigger and shrinks back into it, and a touch during its growth is ignored, as `spec:AST-094` FR31 and FR35 state. Its dismissal is unchanged, and a mouse keeps today's entrance.                                                                                      | `spec:AST-094` FR31, FR35                                                                             | Pending implementation; tests land with it                                                  |

### Allowed variation

- **AV1 — Trigger composition.** Wrapped, render-prop, and referenced-anchor
  modes may attach the same semantic trigger behavior without changing the
  surface contract.
- **AV2 — Popup semantics.** Dialog mode may focus the dialog container;
  role-neutral popups let their child role and content focus model remain
  exposed.
- **AV3 — Surface treatment.** The hook may omit its default paint, change the
  surface padding rung, or add a component-owned refinement target while
  preserving the canonical `popover` ownership, lifecycle, focus containment,
  and dismissal model.
- **AV4 — Placement.** Logical placement, alignment, and preferred width may
  change geometry without changing the overflow precedence below; the fit
  against the viewport is the layer runtime's.

### Representative focus and dismissal states

| State                                             | Required invariant                                                                                                                                                                          | Allowed variation                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Pointer or touch activation of dialog Popover     | Initial focus enters the first genuine content control, with dialog-surface fallback when none exists. Shared modality-aware indication suppresses keyboard-only rings after pointer input. | The trigger and content may vary.                                                                        |
| Keyboard or AT-style activation of dialog Popover | Initial focus enters the first genuine content control, with dialog-surface fallback when none exists. The eligible destination paints the shared keyboard focus indication.                | Activation with absent or zero event detail follows this path. Named AT announcement remains unverified. |
| Read-only dialog                                  | With no genuine caller control, the dialog surface receives initial focus. The injected fallback close control remains hidden and reachable by Tab but is never selected initially.         | Caller content may contain no tabbable control.                                                          |
| Neutral-role popup                                | The neutral wrapper is not selected as a dialog focus target; automatic entry prefers genuine content focus, or callers may disable autofocus for trigger-retained patterns.                | Child menu, listbox, or other semantics own their focus model.                                           |
| Automatic focus disabled                          | Opening does not move focus.                                                                                                                                                                | May be persistent configuration or a one-opening show preference.                                        |
| Controlled open                                   | External open state invokes the no-activation opening path: first genuine content control, then dialog-container fallback.                                                                  | The caller remains the visibility source of truth.                                                       |
| Tab from a focused container                      | Focus enters the first tabbable descendant.                                                                                                                                                 | If none exists, focus remains inside.                                                                    |
| Shift+Tab from a focused container                | Focus enters the last tabbable descendant.                                                                                                                                                  | If none exists, focus remains inside.                                                                    |
| Escape                                            | The topmost eligible Popover closes according to shared dismissal policy.                                                                                                                   | Explicit-dismiss surfaces may disable both light and Escape dismissal.                                   |
| Close after focus entered the popup               | Focus returns to the trigger when removal would otherwise strand focus.                                                                                                                     | A caller may additionally own focus return through its hide notification.                                |

### Transformation and precedence order

- **ORD1 — Visibility operation.** `toggle` selects the existing `show` or `hide`
  transition; it is not a second lifecycle. Every opening path applies same-
  gesture protection before visibility changes. Public `show` retains its existing
  one-opening `skipAutoFocus` preference; otherwise Popover derives genuine
  content focus and its safe surface fallback.
- **ORD2 — Preferred inline size.** An explicit width wins over trigger matching.
  Without explicit width, Popover prefers trigger minimum width. Either
  preferred size is clamped by the layer runtime's viewport cap
  (`spec:AST-059` FR7); neither is capped to the room beside the trigger.
- **ORD3 — Retired.** The viewport fit — gutters, caps, flips, and the slide —
  is the layer runtime's (`spec:AST-059` FR1–FR5). Popover's painted surface
  reads the runtime's cap so overflow state is evaluated against the same
  bound the layer applies.
- **ORD4 — Conditional scroll.** Measured overflow greater than 1 px enables
  internal scrolling and overscroll containment; fitting content leaves both
  disabled.

### Performance and resources

- **PR1 — Open-only observation.** Resize, mutation, captured resource-load,
  window-resize, and visual-viewport-resize observation exists only while the
  Popover component is open; cleanup disconnects listeners and observers and
  cancels pending work.
- **PR2 — One measurement per frame.** Repeated signals while a measurement is
  pending coalesce into one animation-frame callback.
- **PR3 — Stable state update.** Measurement updates overflow state only when the
  overflow boolean changes.

## Accessibility contract

- **AR1 — Trigger relationship.** The trigger exposes expanded state, the popup
  relationship, and a role-appropriate popup type while mounted.
- **AR2 — Dialog naming.** Dialog mode requires a caller-provided accessible
  label and places dialog/modal semantics on the painted surface. Missing naming
  warns in development but does not synthesize a label.
- **AR3 — Focus containment and indication.** Automatic entry and
  Tab/Shift+Tab behavior follow the matrix above; a trapped surface with no
  tabbable descendant does not let focus escape. Eligible focus destinations use
  the shared modality-aware focus indication rather than changing semantic focus
  placement to suppress pointer outlines.
- **AR4 — Focus return.** Dismissal returns focus to the trigger when focus had
  entered the closing Popover and would otherwise be lost.
- **AR5 — Evidence boundary.** Current automated tests establish DOM roles, ARIA
  state, focus movement, and focus return. The Storybook manual-AT story is a
  fixture, not a recorded result. PR #5373 records no named NVDA + Chrome or
  VoiceOver + Safari announcement result, so this contract makes no AT
  announcement claim.

## Design relationships

| Anatomy or state       | Design requirement                                                                                                 | Representation authority       | Hierarchy role | Component contract    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------ | -------------- | --------------------- |
| Trigger element        | Supplies or references the control and anchor without becoming Popover-owned presentation.                         | Caller content                 | Supporting     | FR6, AR1              |
| Popover surface        | Paints the component surface, owns the canonical `popover` target, and carries scroll, focus, and dialog behavior. | Current source and owner DEC-2 | Prominent      | FR2, FR4–FR7, AR2–AR4 |
| Popover content        | Renders caller-supplied interaction or information inside the surface.                                             | Caller content                 | Prominent      | FR2, FR6              |
| Fallback close control | Provides an end-of-trap close affordance without becoming the initial focus destination.                           | `component:Button`             | Supporting     | FR2, AR3              |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Trigger element": {
    "none": {
      "reason": "intentional: The trigger is caller-owned and receives no Popover theming target."
    }
  },
  "Popover surface": {"target": "popover"},
  "Popover content": {
    "none": {
      "reason": "intentional: Caller-supplied content is caller-owned; normal CSS may inherit from the surface, but Popover provides no content target."
    }
  },
  "Fallback close control": {
    "delegatesTo": {"owner": "component:Button", "target": "button"}
  }
}
```

Every public `usePopover` painted surface belongs to the broad `popover` target.
A composed component may add its own authoritative refinement target, such as
`selector-popup` or `multi-selector-popup`, on that same element. New direct hook
consumers that need distinct theme reachability provide and document an owned
`surfaceTarget`.

## Family and system relationships

- `architecture:public-component-api` owns installable reachability and the
  distinction between public package API and source-level implementation seams.
- `architecture:layer-runtime` owns the shared host, native popover lifecycle,
  anchor geometry, the viewport inset (`spec:AST-059`), portal/context
  behavior, and same-gesture dismissal guard; Popover owns its preferred size,
  overflow, and focus composition above that runtime.
- `architecture:interaction-modality` owns shared modality classification and
  focus-indicator visibility. Popover owns semantic focus entry and fallback;
  pointer input does not select a different destination merely to hide an outline.
- `architecture:component-theming-surface` owns anatomy qualification and target
  placement. `popover` is the one broad target on the painted surface. Caller
  content adds no target, the fallback close control delegates to Button's target,
  and composed components own any additional surface refinement target.
- `family:overlay-dismissal` owns topmost Escape and platform-close ordering.
  Popover participates through the shared layer owner while retaining its local
  focus, outside-dismiss, and open-state behavior.

## Verification map

| Contract                     | Verification                                                                                                                                              | Representative states                                                                                              | Mutation or failure expectation                                                                                                                     | Audit section                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Public boundary, FR1         | `Popover.test.tsx` compile-time public-surface assertions plus package/barrel inspection                                                                  | Unchanged public signatures and same-gesture rejection across Popover-family openings                              | A public type changes or a same-gesture request reaches visibility state.                                                                           | `audit:Popover/api`           |
| FR2, AR2–AR4                 | `Popover.test.tsx` focus/role suites and `useFocusTrap.test.tsx` container-entry suites                                                                   | Pointer, keyboard/AT-style, read-only, neutral role, no autofocus, controlled, Tab/Shift+Tab, Escape, focus return | Changing semantic destination by modality, selecting fallback close initially, losing shared indication, or allowing focus escape fails assertions. | `audit:Popover/accessibility` |
| ORD2, FR4                    | `Popover.test.tsx` sizing/overflow suites; `Popover.stories.tsx` match-trigger and overflow scenarios; geometry under `Core/Layer` viewport-inset stories | Explicit width clamped to the viewport, trigger matching, fitting and overflowing content                          | Reversing width precedence, capping to the span beside the trigger, or always enabling scroll fails emitted-style or overflow assertions.           | `audit:Popover/layout`        |
| FR8                          | `Popover.test.tsx` surface-padding suite                                                                                                                  | Default rung, `0`, an explicit rung, a direct hook composition with and without a rung                             | A default other than step 3, a rung landing on a box inside the surface, or the hook painting a rung it was not given fails the suite.              | `audit:Popover/theming`       |
| FR9                          | `spec:AST-094` verification for FR31 and FR35                                                                                                             | Under a finger: open, close, a touch during growth; a mouse                                                        | A Popover that does not grow from and shrink into its trigger, a changed dismissal, or a changed mouse path fails.                                  | `audit:Popover/behavior`      |
| FR5                          | `Popover.test.tsx` scheduling and observer-lifecycle suites                                                                                               | Closed, opened, repeated signals, cleanup                                                                          | Constructing observers while closed or measuring more than once per pending frame fails lifecycle assertions.                                       | `audit:Popover/resources`     |
| FR6, FR7 and theming anatomy | `Popover.test.tsx`, `Popover.doc.mjs`, `usePopover.doc.mjs`, `astryx theme targets Popover --json`, and `scripts/check-knowledge.mjs`                     | One real surface with canonical `popover` plus composed-component refinements                                      | A fake anatomy part, missing canonical output, or an active target without a real owner fails review or validation.                                 | `audit:Popover/theming`       |
| AR5                          | `Popover.stories.tsx` manual-AT fixture and PR #5373 test record                                                                                          | Read-only dialog manual-AT fixture; no recorded NVDA/VoiceOver announcement result                                 | A fixture without recorded AT/browser observations cannot be cited as announcement proof.                                                           | `audit:Popover/at-evidence`   |

## Decision log

### DEC-1 — One canonical visibility operation model

**Reference:** `component:Popover/DEC-1`

**Decider:** Cindy Zhang, 2026-08-31

Showing, hiding, and toggling are one visibility lifecycle. Every opening path
inherits same-gesture reopen protection. Popover derives semantic focus entry;
public `show({skipAutoFocus: true})` remains the existing escape for a custom
composition that owns focus outside the Popover. Public signatures are unchanged.

Rejected: making interaction modality a focus-destination option. Modality owns
focus indication, while Popover owns semantic focus placement.

### DEC-2 — One canonical Popover surface target

**Reference:** `component:Popover/DEC-2`

**Decider:** Cindy Zhang, 2026-08-31

`popover` is the broad canonical theming baseline automatically owned by every
painted surface created by `<Popover>` or public `usePopover`. The temporary
`popover-surface` compatibility name is removed in 0.7.0 under
`architecture:component-theming-surface`; existing themes migrate that key and
selector to `popover`.

Composed components keep authoritative refinement targets such as
`selector-popup` and `multi-selector-popup`. Optional `surfaceTarget` adds that
owned refinement on the same surface; it does not replace the broad `popover`
baseline. New direct hook consumers that need distinct reachability provide and
document an owned target.

Rejected: treating `popover` and `popover-surface` as two durable sibling targets,
or inventing a “Shared hook surface” anatomy part to satisfy inventory coverage.
Both make one painted element look like two design concepts and preserve an
accidental implementation name as permanent public structure.

### DEC-3 — Focus indication does not change semantic focus placement

**Reference:** `component:Popover/DEC-3`

**Decider:** Cindy Zhang, 2026-09-07

Popover uses one content-first semantic focus policy across pointer, keyboard,
and assistive-technology activation. The shared interaction-modality system owns
whether the eligible destination paints a keyboard focus indicator. The injected
fallback close control is excluded from initial focus and reveals only when
reached through sequential keyboard navigation; a labeled dialog surface is the
fallback when caller content has no genuine control.

Every Popover-family opening inherits same-gesture reopen protection through the
visibility lifecycle. Public API signatures remain unchanged.

Rejected: moving focus to the dialog surface on every pointer opening solely to
avoid a keyboard-looking outline. That mixes visual modality with semantic focus
placement and bypasses the shared focus-indication owner.

### DEC-6 — Presentation: the anchored popover, a sheet, or adaptive

**Reference:** `component:Popover/DEC-6`
**Decider:** `cixzhang`, `2026-10-25`

Popover takes `presentation` with the vocabulary the menus already use:
`popover`, `bottom-sheet`, or `adaptive`. `popover` is the default and the
released anchored surface. `bottom-sheet` presents the content in a
BottomSheet. `adaptive` chooses exactly as the menus do: the sheet under
`spec:AST-094` FR13's touch rule, with compact governed by `spec:AST-012` FR9,
and the anchored popover elsewhere.

## Verification gaps

These implementation and evidence items remain required follow-up, but they do
not block acceptance of the semantic contract above.

- **VG1 — Real browser behavior.** Unit tests assert emitted sizing styles and
  synthetic dimensions, not rendered viewport layout. Rendered viewport
  geometry is covered by the `Core/Layer` viewport-inset stories under the
  story play guard; native popover light dismiss, top-layer ordering, rendered
  focus behavior, and focus-indicator modality still require real
  Chromium/WebKit evidence when changed.
- **VG2 — AT announcement.** The current story provides manual instructions, but
  named NVDA + Chrome and VoiceOver + Safari results are absent. No announcement
  outcome is claimed.

## Open questions

None. DEC-1 settles the visibility model, DEC-2 settles canonical target
ownership, and DEC-3 settles semantic focus versus modality-aware indication.
The remaining items are verification work, not human API questions.

## Content boundary

This file does not duplicate consumer signatures, prop tables, examples,
implementation steps, shared layer algorithms, or family dismissal rules. It
links to their owners and records only Popover-specific semantics, boundaries,
and invariants.

### DEC-4 — Surface padding is a spacing-scale rung on the painted surface

**Reference:** `component:Popover/DEC-4`

**Decider:** pending owner review (proposed in PR #6683)

The surface padding becomes a public concept: `Popover` takes `padding` on the
shared spacing scale (`0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10`, the same
shape `Card`, `Stack`, `LayoutContent` and `LayoutPanel` use), defaulting to the
released step 3; `usePopover` takes the same option and paints no padding unless
given one, which is the hook's released behavior. `0` is a flush surface for
content that owns its own edges — a list of rows whose hover paint reaches the
edge, a header row with a bottom rule.

The rung is applied on the painted surface, not on a wrapper inside it, so a
theme's `padding` on the `popover` target keeps replacing it instead of nesting
(the placement DEC-2 already fixed for the surface). This does not enroll Popover
in the container padding protocol: the surface publishes no edge geometry to its
content (`architecture:container-padding/INV8`).

Rejected: a `'none'` string beside the rungs. The nearest existing vocabulary
spells the flush case as `0` on the numeric scale, and a second spelling of the
same value would leave two ways to write one state. Also rejected: moving the
padding onto an inner content wrapper a consumer class can replace — that turns
the released theming placement back into a nested box.
