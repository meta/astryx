---
schema_version: 3
template_version: 7
kind: component
id: component:Drawer
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-30
owners: [cixzhang, imdreamrunner]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Drawer/Drawer.test.tsx,
    packages/core/src/Layer/useLayerDismissal.test.tsx,
    packages/core/src/Layer/layerDismissalFamilies.test.tsx,
    .github/scripts/modal-close-visibility.js,
    apps/storybook/rtl-audit/rtl-audit.mjs,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:component-theming-surface,
    architecture:container-padding,
    architecture:layer-runtime,
    architecture:public-component-api,
    architecture:react-component-runtime,
  ]
contributing: []
system_specs: [spec:AST-027/DEC-3, spec:AST-094]
---

# Drawer component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `@astryxdesign/core` exports `Drawer`, `DrawerProps`, `DrawerHeader`, and `DrawerHeaderProps` from the package root and the `./Drawer` subpath (DEC-3); `@astryxdesign/lab` does not export them. `DrawerProps` extends `BaseProps<HTMLDialogElement>`, separately declares `ref`, requires `isOpen`, `onOpenChange`, `label`, and `children`, accepts `purpose` (`required`, `form`, or `info`; default `info`), an optional `padding` spacing step (FR16), and an optional `experimental` object (DEC-4), and has no `hasCloseButton`. Stable API admission and compatibility belong to `architecture:public-component-api`; `DrawerHeader` is recorded in `component:DrawerHeader`. |
| Behavior                | Drawer-owned visibility is controlled by the caller for a viewport-relative, full-height logical-side overlay. `hasScrim` at native open selects `showModal()` or a manual Popover API host; changing it while open is unsupported. The shared layer dismissal stack gates Escape and platform close for the full rendered lifetime, and `purpose` decides, as in Dialog, whether Escape, platform close, and scrim click request close. Drawer renders no close control of its own. The browser top layer owns paint order in both presentations, exit renders current children, and completed close returns focus to the element focused at open.                                    |
| End-user impact         | A drawer paints no close control of its own; a close button appears in a `DrawerHeader` title row where the caller composes one. `form` drawers ignore scrim clicks, and `required` drawers ignore Escape, platform close, and scrim clicks; a modal `required` drawer is announced as an alert dialog. Shared topmost/IME Escape routing, top-layer paint order, one dismissal per request, and focus return apply in both presentations.                                                                                                                                                                                                                                             |
| Builder impact          | Import from `@astryxdesign/core/Drawer` or the Core root. For a visible close action, compose `<DrawerHeader title onOpenChange>` in a `Layout` header slot, as `DialogHeader` is composed in Dialog. The Content area is inset by `--spacing-4` by default; `padding={0}` gives a full-bleed Content area. Set `purpose` where Dialog would. State and content remain caller-owned; Drawer renders the caller's current children during exit. Sibling composition is current consumer guidance, and a consumer `onKeyDown` that prevents default cancels Escape dismissal.                                                                                                            |
| Compatibility/readiness | Records shipped behavior; no public change. Drawer is a Core component imported from `@astryxdesign/core/Drawer` (DEC-3). Five implementation gaps, listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Review checks           | Reject regional, docked, or block-axis models; claims that modality and scrim are currently independent; reintroduction of a Drawer-local Escape registry, a page-level z-index band, or a Drawer-owned close button; a dismissal policy that diverges from Dialog's `purpose`; claims that mixed-presentation or nested stacking is guaranteed beyond the shared stack's contract; a surviving `@astryxdesign/lab` export; or claims of stable API/theming compatibility that `architecture:public-component-api` has not admitted.                                                                                                                                                   |
| Governing rules         | `family:overlay-dismissal`; `architecture:layer-runtime`; `architecture:container-padding`; `spec:AST-027/DEC-3`; `design:reduced-motion`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

This table is a review projection; the body below is authoritative.

## Intent

Drawer presents contextual details or controls in a full-height side panel that
floats over the current page without reflowing it. It supports modal inspection
with a scrim and non-modal master-detail inspection that leaves the page behind
available.

This record covers the viewport-only Core component: its shared layer
lifecycle, its Dialog-aligned close control and dismissal policy (DEC-1), and its
container padding (DEC-2). It introduces no scope concept. In particular, it
does not revive a regional, pane-scoped, or container-targeted Drawer model.

## Compatibility and migration

- Released default preserved: `yes`.
- Compatibility class: records shipped behavior; no public change. Core
  exports Drawer from the root and the `./Drawer` subpath; `@astryxdesign/lab`
  does not.
- Container padding (FR16, DEC-2): the `padding` prop or a theme's `padding` on
  `drawer` insets the Content area through container tokens. With neither set
  the inset is `--spacing-4`, as in Dialog; `padding={0}` keeps a full-bleed
  Content area. The block-end safe-area inset applies in every mode.
- Experimental surface (DEC-4): full-viewport mobile coverage is the
  `isFullWidthOnMobile` option inside the optional `experimental` prop object,
  outside the stable compatibility promise (`spec:AST-017/FR21`). Omitting
  `experimental` keeps the 56px page reveal.
- Controlled/uncontrolled behavior: unchanged for Drawer-owned paths; callers
  provide `isOpen`, while direct native mutation through the public dialog ref is
  outside that guarantee.
- Migration decision: none.

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Drawer builds its own top layer, exit, and backdrop.** Drawer mounts its own
  modal and popover hosts, runs its own exit hold, and paints its own scrim.
  `architecture:layer-runtime` INV14 has a layer use the runtime's top-layer
  mounting, presentation hold, exit copy, and backdrop tint.
- **Reduced motion keeps a 0.01 s slide on every pointer.** Under reduced
  motion the slide and the scrim transition still run for 0.01 s. For a fine
  pointer, `design:reduced-motion` DR1 forbids the travel and DR3 allows no
  animated property; a touch user gets no opacity fade, which DR2 calls for.
- **A tap during the entrance is not held.** Under a finger, a scrim tap that
  lands while the drawer is still entering closes an `info` drawer, and a tap
  or drag reaches the panel. `spec:AST-094` FR35 holds pointer input until the
  entrance finishes.
- **A consumer `onCancel` never runs.** Drawer sets its own `onCancel` after
  the caller's props, so a caller's `onCancel` is dropped.
  `architecture:public-component-api` INV5 has accepted event inputs reach the
  element.
- **The container-padding record does not list Drawer.** Drawer's Content
  area publishes its inset (FR16, DEC-2), but `architecture:container-padding`
  does not name Drawer among its container publishers.

## Ownership boundary

**Owns**

- The viewport-relative side-panel surface, logical edge, inline-size budget, and
  entry/exit motion.
- The current presentation input: its value at native open selects `showModal()`
  or the manual Popover API host. Changing it while open is unsupported.
- Drawer-local focus entry/return, the `purpose` dismissal policy, uncanceled
  backdrop-click handling, and retention of its host through controlled exit
  while rendering current caller-owned children.
- The Content area's container padding, published per
  `architecture:container-padding`; the root dialog remains the overlay
  boundary owner.
- Registering the layer with the shared dismissal stack for its rendered
  lifetime. Escape and platform-close routing belong to the shared owner; paint
  order in both presentations belongs to the browser top layer.

**Does not own / non-goals**

- Caller-provided forms, inspectors, footers, or other content. `DrawerHeader`
  is optional composition, not required anatomy.
- Block-axis sheets — owned by `component:BottomSheet`.
- Persistent panels that reserve layout space or push page content.
- Regional or pane-scoped placement, a caller-supplied container, or independent
  modality and scrim axes. Those are not current Drawer concepts.
- Cross-family Escape and platform-close ordering — owned by
  `family:overlay-dismissal`; Drawer participates through the shared owner.
- `DrawerHeader`, its title row, close action, and targets — owned by
  `component:DrawerHeader`.

## Public concepts

Consumer prop syntax and examples remain in `Drawer.doc.mjs`.

| Concept             | Closed values or states                              | Meaning                                                                                                                                               | Availability by state                                           | Default                                | Owner                    | Stability                     | Invalid-value behavior                                |
| ------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------- | ------------------------ | ----------------------------- | ----------------------------------------------------- |
| visibility          | open, closed                                         | whether caller-controlled Drawer presentation is requested                                                                                            | all presentations                                               | caller-controlled                      | `component:Drawer`       | Core contract                 | required controlled value                             |
| logical edge        | inline start, inline end                             | viewport edge from which the panel enters and exits                                                                                                   | open and exiting                                                | inline end                             | `component:Drawer`       | Core contract                 | closed type rejects other values                      |
| presentation        | modal with scrim, non-modal without scrim            | native host mode and associated document semantics                                                                                                    | chosen when the native host opens; live changes are unsupported | modal with scrim                       | `component:Drawer`       | Core contract                 | one current boolean selects the initial mode          |
| inline-size budget  | pixel number or valid CSS length                     | desktop inline size and reveal-mode mobile cap                                                                                                        | desktop and mobile page-reveal mode                             | `400px`                                | `component:Drawer`       | Core contract                 | invalid CSS lengths are unsupported                   |
| mobile coverage     | page reveal, full viewport                           | whether narrow viewports retain a visible page strip                                                                                                  | viewports at or below the mobile boundary                       | 56px page reveal                       | `component:Drawer`       | experimental (DEC-4)          | closed boolean                                        |
| dismissal purpose   | info, form, required                                 | which implicit requests close: `info` allows Escape, platform close, and scrim click; `form` allows Escape and platform close; `required` allows none | all presentations; scrim click applies to modal only            | info                                   | `component:Drawer`       | Core contract matching Dialog | closed type rejects other values                      |
| header close action | rendered, absent                                     | whether `DrawerHeader` renders its close button                                                                                                       | wherever `DrawerHeader` is composed                             | absent unless `onOpenChange` is passed | `component:DrawerHeader` | Core contract                 | an omitted callback renders no button                 |
| content inset       | spacing step, theme `drawer` padding, or the default | container padding of the scrolling Content area, published to descendants per `architecture:container-padding`                                        | all presentations                                               | `--spacing-4`, as in Dialog            | `component:Drawer`       | Core contract matching Dialog | closed numeric type rejects other values              |
| sibling order       | earlier opened, later opened, exiting, closed        | shared-stack Escape eligibility and browser top-layer paint order                                                                                     | sibling Drawers in either presentation                          | later opened is topmost                | `component:Drawer`       | Core contract                 | nested composition is outside the documented contract |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Basis                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| FR1  | Drawer MUST remain a viewport-relative, full-block-size overlay on the logical inline-start or inline-end edge and MUST NOT reserve layout space or reflow the page beneath it.                                                                                                                                                                                                                                                                                                                                                                                                       | Current source, docs, stories, and tests                         |
| FR2  | The logical edge selected for an open Drawer MUST remain latched through its exit even when caller state changes the live edge prop during close.                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current exit-side test and implementation                        |
| FR3  | The desktop inline-size budget MUST accept pixel numbers or CSS lengths and remain bounded by the viewport. At or below 640px, page-reveal mode MUST preserve 56px and use `width` as a cap; full-mobile mode MUST override `width` with `100dvw`.                                                                                                                                                                                                                                                                                                                                    | Current docs, styles, and width tests                            |
| FR4  | Visibility through Drawer-owned behavior MUST follow `isOpen`. Uncanceled Escape routed by the shared stack and uncanceled modal-backdrop activation request `false` when `purpose` allows (FR15), and a `DrawerHeader` close action requests `false` through the callback it is given; Drawer prevents its handled native `cancel` event from closing the dialog directly. During controlled exit, Drawer keeps its host and content region mounted while rendering the caller's current `children`.                                                                                 | Current prop contract and lifecycle tests                        |
| FR5  | At open time, `hasScrim={true}` MUST select native `showModal()` with `aria-modal`, a focus trap, body scroll locking, and a visible backdrop; `hasScrim={false}` MUST select a manual Popover API host that leaves the page behind interactive. Changing `hasScrim` while open is not a supported native-mode transition.                                                                                                                                                                                                                                                            | Current source, docs, and initial-mode tests                     |
| FR6  | An uncanceled modal root/backdrop click (`target === currentTarget` while live `hasScrim` is true) MUST request close when `purpose` is `info`, and MUST NOT for `form` or `required`. Descendant clicks and dialog-root clicks while live `hasScrim` is false MUST NOT request close, and non-modal presentation MUST NOT install an invisible outside-pointer dismissal plane.                                                                                                                                                                                                      | Current click tests                                              |
| FR7  | Drawer MUST NOT render a close control of its own. A visible close action is caller composition, normally `DrawerHeader` with `onOpenChange` (`component:DrawerHeader` FR3), which requests `false` through that callback without taking open-state ownership.                                                                                                                                                                                                                                                                                                                        | DEC-1; close-control suite                                       |
| FR8  | Opening MUST present the native host, capture the element focused before opening, and attempt to focus the first rendered `[data-autofocus]` descendant, if any. After a completed controlled close releases the native host, Drawer MUST attempt to restore focus to the captured element. The non-modal host's synthetic `close` event MUST dispatch after that restore attempt — matching the task-queued native `dialog.close()` event — so a consumer close listener keeps the last word on final focus.                                                                         | Current presence hook and focus tests                            |
| FR9  | Closing MUST retain the panel host, content region, edge, and native presentation while the exit remains visible and continue rendering the caller's current `children`. The transform transition is authoritative, a computed-duration backstop prevents a lost event from stranding the host, and native release and React hiding land together so no frame paints outside the top layer.                                                                                                                                                                                           | Current lifecycle tests and browser close-visibility guard       |
| FR10 | Sibling Drawers MUST be composed as siblings. The last-opened present sibling owns the first Escape request through the shared stack; a closing sibling retains that ownership through its visible exit, and reopening registers a new active cycle so one request never closes two surfaces. Paint order in both presentations follows the browser top layer's chronological order.                                                                                                                                                                                                  | Current docs, shared stack, and tests                            |
| FR11 | `DrawerProps` extends `BaseProps<HTMLDialogElement>` and separately declares `ref`. The root filters `open`, merges `xstyle`, `className`, and `style`, forwards remaining unclaimed props, composes consumer `onClick`, forwards consumer `onKeyDown` ahead of the shared document-level Escape owner, and owns `aria-label`, `aria-modal`, and, for a modal `required` drawer, `role="alertdialog"`. Implementation gap: a consumer `onCancel` is dropped (Current-state impact). A consumer `onKeyDown` that prevents default cancels shared-stack Escape dismissal for the press. | Current source and focused keyboard tests                        |
| FR12 | The painted root dialog emits the documented `drawer` target and `side` selector axis and applies the container-padding reset. `DrawerHeader`'s targets are owned by `component:DrawerHeader` FR5. No separate Drawer target is currently emitted for content or scrim; future target qualification remains owned by `architecture:component-theming-surface`.                                                                                                                                                                                                                        | Current source, docs, and structural target metadata             |
| FR13 | Drawer MUST join the shared dismissal stack for its full rendered lifetime, provide logical depth to descendant layers, route platform close through the same topmost/IME decision, and preserve consumer `preventDefault()` ownership.                                                                                                                                                                                                                                                                                                                                               | Shared family contract and focused tests                         |
| FR14 | Non-modal Drawer MUST use a manual Popover API host so cross-surface order comes from the browser top layer rather than a page-level z-index band. The reduced fallback may use `dialog.show()` only below the Popover API support floor.                                                                                                                                                                                                                                                                                                                                             | Current source, browser guard, and `spec:AST-027`                |
| FR15 | `purpose` takes the same values and default as Dialog's prop. `info` (default) lets Escape, platform close, and a modal scrim click request close; `form` lets Escape and platform close request close and ignores scrim clicks; `required` lets none request close, registers with the shared stack as `block` so the request does not reach a lower layer, and exposes a modal drawer as `role="alertdialog"`. Without a scrim, `form` and `info` behave the same.                                                                                                                  | DEC-1; purpose suite; `family:overlay-dismissal` Escape behavior |
| FR16 | The Content area pads caller content by the drawer's container inset, `--spacing-4` by default as in Dialog, and publishes the applied inset to descendants as a container publisher would; `architecture:container-padding` does not yet admit Drawer as one (Current-state impact). Its block-end edge applies the container inset plus the home-indicator safe area while publishing the inset alone, so a bleed child subtracts only the inset and the safe area survives below it. The root dialog keeps the container-padding reset (FR12).                                     | `architecture:container-padding`; container padding suite        |

### Allowed variation

- **AV1 — Caller content.** Any renderable inspector/detail content may occupy the
  scrolling content region without becoming Drawer-owned anatomy. Drawer renders
  current `children`; callers decide whether the underlying data remains available
  during exit.
- **AV2 — Inline size.** Consumers may choose the desktop budget within valid CSS
  and viewport constraints. It remains the cap in mobile page-reveal mode, while
  full-mobile mode uses `100dvw` instead.
- **AV3 — Presentation.** The value at native open selects the modal dialog or
  the non-modal popover host. Changing `hasScrim` while open is unsupported.
- **AV4 — Close control.** Callers choose whether to render a close action,
  normally `DrawerHeader` with `onOpenChange`, or their own control.
- **AV6 — Dismissal purpose.** Callers choose `info`, `form`, or `required`.
- **AV5 — Motion duration.** Themes may alter the transform transition duration;
  close timing follows computed CSS and reduced-motion preferences.

### Representative states

| State                             | Required invariant                                                                                                                              | Allowed variation                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Closed                            | no native presentation or visible panel                                                                                                         | caller content may remain mounted in React                                           |
| Modal inspector                   | opened with `hasScrim` true via `showModal()` with scrim, modal semantics, focus trap, and body lock                                            | edge, width, caller content, autofocus destination, header close action, and purpose |
| Non-modal master-detail inspector | opened with `hasScrim` false via the manual popover host; no scrim, `aria-modal`, or body lock; the page behind stays interactive               | edge, width, caller content, header close action, and purpose                        |
| Required modal drawer             | Escape, platform close, and scrim click do not close; exposed as `alertdialog`; a lower layer does not receive the Escape                       | caller-provided way out                                                              |
| Narrow viewport with page reveal  | panel does not exceed its `width` cap and preserves 56px of the page                                                                            | requested width below the cap                                                        |
| Narrow full-coverage viewport     | panel uses `100dvw`, overriding the requested `width`                                                                                           | caller content                                                                       |
| Two sibling Drawers               | later-opened open Drawer paints above through the browser top layer and owns the first Escape request through the shared stack                  | edge, width, caller content, and either presentation composed as siblings            |
| Exiting Drawer                    | panel host, content region, logical edge, native presentation, and stack registration remain while the exit is visible; current children render | caller-controlled child data and motion duration                                     |

### Transformation and precedence order

- **ORD0 — Content inset.** The `padding` prop, then the theme's `padding`
  properties on `drawer`, then `--spacing-4`, as in Dialog. The block-end
  safe-area inset is added after that resolution in every mode.
- **ORD1 — Open.** Resolve the current logical edge and width, retain the rendered
  panel, capture the currently focused element, use current `hasScrim` to select
  the native host, then honor a rendered autofocus destination.
- **ORD2 — Close.** During controlled close, Drawer keeps its panel and
  caller-provided content visible through the exit animation. Transition
  completion or the computed-duration backstop releases the native host and hides
  React output together, so presentation ends without an intermediate visible
  frame; Drawer then attempts to restore focus to the previously focused element
  when available. The non-modal host's synthetic `close` event dispatches only
  after that restore attempt, so a consumer close listener that retargets focus
  observes the same last-word ordering as the task-queued native event.
- **ORD3 — Sibling order.** Sibling order comes from the shared dismissal stack
  and the browser top layer: the last-opened present sibling is frontmost and
  handles Escape first in both presentations. Descendant overlays remain governed
  by their own component and family contracts rather than Drawer nesting.

### Performance and resources

- **PR1 — Exit-only resources.** Transition listeners and the backstop timer exist
  only while close is waiting for the visible transform exit and are removed on
  completion, interruption, or unmount.
- **PR2 — Presentation cleanup.** Native presentation and any active body scroll
  lock exist only for their active states and are released on controlled close,
  unmount, or hidden Activity cleanup.
- **PR3 — Viewport-relative sizing.** Drawer derives sizing from `width`, the
  experimental `experimental.isFullWidthOnMobile` option (DEC-4), and the
  viewport; callers do not supply a regional measurement target.

## Accessibility contract

- **AR1 — Name.** `label` is a required string forwarded to `aria-label`; caller
  content is not used as an implicit name. Current code does not reject an empty
  or whitespace-only value.
- **AR2 — Modal truthfulness.** At open time, `hasScrim={true}` uses native modal
  dialog state and `aria-modal`; `hasScrim={false}` uses the non-modal popover
  host and omits `aria-modal`. A modal `required` drawer uses
  `role="alertdialog"`. Changing `hasScrim` while open is not a supported
  transition.
- **AR3 — Keyboard dismissal.** Escape requests close only for the topmost
  registered layer through the shared stack and only when `purpose` allows; a
  `required` drawer consumes it. A consumer `onKeyDown` that prevents default
  cancels that dismissal, and unrelated keys do not dismiss.
- **AR4 — Focus lifecycle.** Focus enters visible Drawer content through the
  documented autofocus/native path and, after a completed controlled close, Drawer
  attempts to restore focus to the element that was active when the Drawer opened.
- **AR5 — Close affordance.** Drawer provides no close control of its own; the
  `DrawerHeader` close action's name and behavior are owned by
  `component:DrawerHeader`.
- **AR6 — Direction and motion.** Logical inset placement and slide-direction
  mirroring follow DOM directionality from the nearest effective `dir` attribute,
  including an explicit local override or an inherited direction. As required by
  `design:bidirectionality`, a region whose direction differs from its ancestor
  describes that direction in DOM `dir`; a CSS-only `direction` declaration is
  not a supported substitute. Under reduced motion the entrance and exit are an
  opacity-only fade of 200 ms or less on a coarse pointer
  (`design:reduced-motion` DR2) and immediate otherwise (DR3), without changing
  the final state, apart from the reduced-motion gap (Current-state impact).

## Design relationships

| Anatomy or state | Design requirement                                                                                                     | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Panel            | Paints the full-height side surface and owns edge, width, border, shadow, and motion.                                  | Current source and public docs | Prominent      | FR1–FR3, FR9, FR12 |
| Content region   | Provides full-height scrolling and the container inset for caller-owned inspector content.                             | Current source and public docs | Prominent      | FR4, FR16, AV1     |
| Header           | `DrawerHeader` supplies the title row and, when given `onOpenChange`, the close action.                                | `component:DrawerHeader`       | Supporting     | FR7, AR5           |
| Modal scrim      | At initial modal open, communicates the scrim-backed presentation and provides root-click activation behind the panel. | Current source and public docs | Supporting     | FR5, FR6, AR2      |
| Page reveal      | Preserves overlay context on narrow viewports unless full coverage is requested.                                       | Current public docs            | Supporting     | FR3                |

The root Panel carries the current `drawer` target and reflects `side`;
`DrawerHeader`'s targets are owned by `component:DrawerHeader`. No separate
Drawer target is reachable for Content region or Modal scrim, and future target
qualification is not decided here. No anatomy-theming map is recorded yet; the
block is optional during migration, so the map is deferred.

## Family and system relationships

- `family:overlay-dismissal` owns cross-component Escape and platform-close
  ordering. Drawer participates through the shared owner for its rendered
  lifetime and supplies logical depth to descendant layers.
- `architecture:layer-runtime` owns the distinction between native modal hosting,
  non-modal dialog presentation, top-layer behavior, and shared layer plumbing.
  Drawer's content root applies the shared private text baseline and layer
  content boundary, as in Dialog: surface-scoped ancestor membership stops at
  the drawer, while ordinary application contexts keep flowing to its content.
- `architecture:public-component-api` owns stable API admission and compatibility.
  FR11 records current DOM/ref/event reachability without making a stable
  compatibility decision.
- `architecture:react-component-runtime` owns effect/resource cleanup, native-host
  synchronization, and node/lifecycle safety. This record covers Drawer-owned
  visible close and focus-handoff outcomes.
- `architecture:component-theming-surface` owns target qualification and future
  anatomy mapping; this record covers the existing `drawer` target only.
- `architecture:container-padding` owns the shared container inset protocol.
  It does not yet admit Drawer's Content area as a container publisher (FR16).
- `spec:AST-027/DEC-3` requires equivalent floating interactions to use an
  applicable native top-layer host. Modal `showModal()` and non-modal manual
  Popover hosting satisfy that cross-surface route; the documented reduced
  fallback remains below the Popover API support floor.

## Verification map

| Contract        | Verification                                                                                                              | Representative states                                                                                                   | Mutation or failure expectation                                                                                                                                                                    | Audit section                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| FR1–FR7         | `Drawer.test.tsx` render, initial-mode, click, sizing, side, and control suites                                           | closed/open, both edges, initial modal/non-modal modes, mobile widths                                                   | Layout reflows; an initial mode gains the wrong semantics; uncanceled root-click or full-mobile sizing becomes nondeterministic.                                                                   | `audit:Drawer/behavior`      |
| FR11            | Drawer source and focused keyboard composition/cancellation tests                                                         | filtered `open`, merged styling/ref, forwarded unclaimed props, owned ARIA/cancel, composed click, forwarded keydown    | Current forwarding changes without review or shared-stack Escape ignores documented consumer cancellation.                                                                                         | `audit:Drawer/public-api`    |
| FR8, AR1–AR5    | `Drawer.test.tsx` label forwarding, autofocus, close, and focus-return suites plus the browser guard's final-focus checks | initial modal/non-modal modes, autofocus target, connected previously focused element, close listener retargeting focus | Focus moves before presentation, completed controlled close fails to restore focus, the synthetic close overrides a consumer listener's focus target, or label forwarding/dismissal naming breaks. | `audit:Drawer/accessibility` |
| FR9, PR1–PR2    | close timing tests, browser close-visibility guard, and presence-hook source inspection                                   | controlled close, transform end, unrelated transition, lost-event backstop                                              | Native presentation ends before visible exit, the host is stranded, cleanup paths retain resources, or an intermediate frame paints outside native presentation.                                   | `audit:Drawer/motion`        |
| FR10, FR13, AR3 | Drawer shared-stack suites plus `useLayerDismissal` and family tests                                                      | siblings, closing top, reopen, unmount, nested descendant                                                               | One Escape closes two surfaces, a closing host drops ownership, or a reopened sibling keeps stale order.                                                                                           | `audit:Drawer/layers`        |
| FR14            | Drawer source plus `spec:AST-027` impact inventory and native-host browser guard                                          | modal host, manual-popover host, reduced fallback                                                                       | Non-modal presentation returns to a page-level band or loses native-host ordering.                                                                                                                 | `audit:Drawer/layers`        |
| FR15            | `Drawer.test.tsx` purpose suite                                                                                           | `info`, `form`, `required`; modal and non-modal; a sibling behind a required drawer                                     | A `form` drawer closes on a scrim click, a `required` drawer closes or lets Escape reach the drawer behind it, or its role semantics drift.                                                        | `audit:Drawer/behavior`      |
| FR12            | source, `Drawer.doc.mjs`, and current target discovery                                                                    | start/end root Panel and inherited container context                                                                    | Current root target/axis or padding reset changes, or the record claims an unreachable child target or decides future admission.                                                                   | `audit:Drawer/theming`       |
| FR16            | `Drawer.test.tsx` container padding suites; `defineTheme.test.ts` drawer mapping; browser evidence                        | default, `padding` prop, theme `padding`, lone padded Section child, Layout composition                                 | The published inset differs from the applied padding, the default drawer changes geometry, or the block-end safe area is lost or double-subtracted.                                                | `audit:Drawer/theming`       |
| AR6             | `DrawerDirection.test.tsx` DOM-direction and closed/entry parity suites plus exact-head Storybook RTL evidence            | start/end; self-applied, inherited, and nested opposite `dir`; closed and opening transforms                            | Any effective DOM direction or local override moves the panel from a different edge than its logical placement, or closed and opening transforms diverge.                                          | `audit:Drawer/accessibility` |

Read from source, with no focused test yet:

- FR1: not reserving layout space or reflowing the page.
- FR5: body scroll locking for a modal drawer.
- FR9: the computed-duration backstop.
- FR13: logical depth for descendant layers, and platform-close routing.
- FR14: the `dialog.show()` fallback below the Popover API support floor.
- PR1–PR2: listener, timer, presentation, and scroll-lock cleanup.

## Decision log

- **DEC-1 — The close control and dismissal policy match Dialog** (owner
  decision, 2026-10-01). Drawer renders no built-in close button and has no
  `hasCloseButton`; it takes Dialog's `purpose` values and default; and
  `DrawerHeader` has `DialogHeader`'s API, rendering a close action only when
  `onOpenChange` is passed. A Drawer-owned header, rather than `DialogHeader`,
  keeps Drawer's focus entry (`data-autofocus` after native presentation) and
  `label` naming and avoids `dialog-header` theme targets. Rejected: a built-in
  button hidden only for `required`; reusing `DialogHeader`.

- **DEC-2 — Drawer is a container, like Dialog** (owner decision,
  2026-10-08). The scrolling Content area is a container publisher with
  Dialog's contract: a `padding` prop on Dialog's spacing-step scale, theme
  `padding` on `drawer` expanded to `--astryx-drawer-padding*` container
  tokens, and a `--spacing-4` default shared by the edge and Layout inset
  chains. `DrawerHeader` sits in a `Layout` header slot, and the Layout
  redistributes the inset to its regions, so the header is not inset twice. The
  block-end edge adds the home-indicator safe area on top of the inset in every
  mode. Rejected: padding the panel root (the overlay boundary); a full-bleed
  default (diverges from Dialog).

- **DEC-3 — Drawer is a Core component** (owner decision, 2026-10-08).
  `Drawer`, `DrawerHeader`, and their prop types ship from
  `@astryxdesign/core/Drawer` and the Core root, and their docsite demos are
  Core blocks. `@astryxdesign/lab` does not export them.

- **DEC-4 — Full-viewport mobile coverage is experimental** (owner decision,
  2026-10-15). `isFullWidthOnMobile` lives inside the optional `experimental`
  prop object, marked `@experimental` in declarations and
  `stability: 'experimental'` in authored docs, so it may change or be removed in
  a patch release (`spec:AST-017/FR21`). Omitting `experimental` keeps the 56px
  page reveal. Rejected: a top-level stable `isFullWidthOnMobile` prop.

## Open questions

- Should `DrawerHeader` supply a default focus target and name the Drawer through
  `aria-labelledby`, as `DialogHeader` does for Dialog? Today `label` is required
  and focus entry uses `data-autofocus`.
- Should an explicit `padding` prop keep adding the block-end safe area
  (DEC-2), or adopt Dialog's fullscreen rule, where an explicit value replaces
  the safe-area fallback entirely?
- How `DrawerHeader`'s `endContentEdgeCompensation` axis values map onto
  `endContentEdge` treatment values is carried in `component:DrawerHeader`'s
  open questions.

Regional placement, independent modality/scrim axes, and block-axis sheets
are outside the current component boundary. Any future proposal for them requires
fresh public-API and design authority.

## Content boundary

This file does not duplicate consumer prop tables or examples, shared
dismissal-stack internals, transition algorithms, current audit scores,
implementation steps, or shared family/system rules. It links to their owners.
