---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-003
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-30
phase: accepted
owners: [cixzhang, imdreamrunner]
affects_architecture:
  [
    architecture:layer-runtime,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
affects_families: [family:overlay-dismissal]
affects_contributing: []
affects_consumer_docs: []
---

# Layer coordination and global hosting system spec

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "layering": ["FR4", "FR10", "DEC-1", "DEC-2", "DEC-3", "DEC-5", "DEC-6"]
  }
}
```

## Intent

Make every layered interaction close the intended owner or interaction branch,
without transient surfaces shielding it or one pointer gesture closing and then
reopening it. Selected app-global systems must remain visible and operable above
native modal dialogs through browser-valid native hosting.

The full anchored-layer contract must also state its platform dependency honestly:
native Popover API plus CSS Anchor Positioning provide full behavior; unsupported
browsers receive a usable reduced fallback, not equivalent behavior.

## Non-goals

- Making every layer dismissible through every channel.
- Replacing component-owned focus, modality, outside-dismiss policy, backdrop,
  swipe threshold, hover timing, open-state API, animation, or visual treatment.
- Giving every overlay a global or above-modal mode.
- Replacing native Popover and CSS Anchor Positioning with a legacy positioning
  and dismissal polyfill.
- Changing the public API merely to expose internal owner, branch, or gesture
  bookkeeping.

## Requirements

### Interaction ownership and association

- **FR1 — Coordination models interaction roles.** A registered surface is an
  active dismiss owner, a blocking owner, or a passive dependent. A visual-only
  surface does not register as an interaction owner.
- **FR2 — Active owners may dismiss.** An active owner owns task or interaction
  state and invokes its component-owned close behavior when the selected channel
  participates.
- **FR3 — Blocking owners consume without closing.** A blocking owner prevents a
  channel from reaching an owner behind it. Required Dialog is the representative
  Escape/platform case.
- **FR4 — Passive dependents never shield owners.** An unpinned Tooltip is
  passive. It does not win or block dismissal and disappears as a consequence
  when its associated owner or trigger interaction closes. A Tooltip or
  HoverCard that a press pinned open (`component:Tooltip` FR9,
  `component:HoverCard` FR9) is an active owner: it takes Escape first and
  closes, and the owner beneath it stays open for that press (DEC-6).
- **FR5 — Associations are explicit.** Every active or blocking owner records an
  optional parent owner and an interaction-branch root. A passive dependent
  records its associated owner or trigger without creating an owner node or
  branch boundary.

### Channel-specific arbitration

- **FR6 — Escape and platform close select one eligible owner.** One-at-a-time
  channels select the highest associated active or blocking owner whose
  component policy participates. Active closes, blocking consumes, passive and
  visual-only surfaces are skipped.
- **FR7 — Outside interaction resolves branches.** Outside interaction is
  evaluated against owner surfaces, associated triggers or invokers, and branch
  relationships. It does not reuse visual or registration topmost order.
- **FR8 — Menu cascades close as one branch.** DropdownMenu and its open flyout
  submenus share one branch root. Outside that root closes the root and every
  open submenu.
- **FR9 — Nested child branches can close independently.** A distinct nested
  Popover creates a child branch. Interaction inside the parent branch but
  outside the child closes only the child; interaction outside both resolves
  both affected branches according to component policy.
- **FR10 — Component policy stays with the component.** Shared coordination
  determines the eligible owner or affected branch. The owning component or
  family determines whether that channel dismisses, blocks, or passes.

### Same-interaction protection

- **FR11 — Pointer dismissal claims the interaction before closing.** Every
  pointer-driven outside, light-dismiss, backdrop, touch, or swipe path that can
  collide with an associated trigger records a branch claim before visibility
  changes.
- **FR12 — Every reopen path honors the claim.** Associated triggers, native
  invokers, `show()`, and toggle paths refuse the same physical gesture. A later
  gesture may reopen.
- **FR13 — Browser event order is irrelevant.** The claim works whether native
  close is observed before or after click. Timestamp windows do not substitute
  for gesture identity.
- **FR14 — Menu hover suppresses exposure-induced hover.** When a closing panel
  exposes a stationary trigger, the resulting synthetic `mouseenter` does not
  reopen the branch. A genuine leave and later hover may open it again.

### Native hosting for selected global systems

- **FR15 — Global admission is explicit.** A system receives above-modal global
  hosting only through an owner-approved update to `architecture:layer-runtime`.
  Ordinary trigger- or task-associated overlays remain local.
- **FR16 — Toast is globally hosted.** ToastViewport remains visible and operable
  above the current native modal. Toast remains passive in layer dismissal:
  Escape/platform arbitration skips it, and auto-hide, explicit controls, or a
  direct toast swipe dismiss only the toast.
- **FR17 — CommandPalette is a global active owner in launcher mode.** Normal
  CommandPalette uses a later native modal host and forms an active interaction
  branch above the prior modal. `isInline` previews are not global or modal.
- **FR18 — Native modal ancestry supplies passive global hosting.** The app has a
  root global outlet and each active native modal supplies an outlet in its DOM.
  Passive global hosts render into the latest active modal outlet, falling back
  to the root outlet when no modal is active. An ordinary body portal or
  `z-index` is not sufficient.
- **FR19 — Global state survives rehosting.** Toast dispatch, visible entries,
  timers, focus handoff, and collision state live above the selected outlet so
  modal opening or closing does not reset them.
- **FR20 — Current nonqualifiers stay local.** Banner and FieldStatus remain
  in-flow; `useAnnounce` remains nonvisual; AlertDialog, imperative Dialog,
  Lightbox, and ordinary Popover-family surfaces remain task- or
  trigger-associated.

### Anchored-layer support requirements

- **FR21 — Native features define full anchored behavior.** Supported native
  Popover API plus CSS Anchor Positioning provide top-layer promotion, native
  light dismissal, auto-popover association, logical anchor geometry, and
  collision fallbacks.
- **FR22 — Unsupported browsers receive a usable reduced fallback.** Explicit
  controls still show and hide mounted content, callbacks and React state update,
  and fixed coordinates apply. The fallback is not required to reproduce native
  top-layer, outside-dismiss, close-request, auto-stack, invoker focus-order,
  anchor-geometry, or collision behavior.
- **FR23 — Public docs state the boundary.** `useLayer`, Popover, and relevant
  component docs distinguish full native behavior from reduced fallback behavior
  without calling the fallback equivalent.

### Implementation requirements

- **IR1 — Coordination exposes two operations.** Shared infrastructure provides
  an eligible-owner resolver for one-at-a-time channels and an associated-branch
  resolver for outside interaction. One generic `isTopmost` operation cannot
  implement both contracts.
- **IR2 — Branch identity is reusable.** Dropdown submenu context projects its
  existing root-close chain into shared branch identity. Independent nested
  Popovers create child branches rather than joining a menu cascade accidentally.
- **IR3 — Gesture claims extend the existing owner.** Branch claims build on
  `gestureCounter` rather than introducing per-component timestamp heuristics.
- **IR4 — Native global outlets are narrow infrastructure.** Global outlet
  selection does not become a public `global` prop on Layer or Popover.
- **IR5 — Runtime behavior changes stay atomic.** Eligibility, branch
  coordination, gesture claims, global hosting, and support documentation may
  ship as separate changes while preserving this one accepted contract.

### Platform support

- Supported feature/engine floor: the full contract applies where native Popover
  API and CSS Anchor Positioning are supported by Astryx's published browser
  matrix.
- Unsupported behavior: browsers below that feature floor receive FR22 only.
  Native modal Dialog behavior remains subject to the supported dialog floor.
- Browser evidence: native light dismissal, invoker behavior, top-layer order,
  focus/inertness, modal outlets, and anchor geometry require real Chromium and
  WebKit. Playwright WebKit is not evidence of Safari-specific behavior.

## Current-state impact

Current `main` does not satisfy this spec completely:

- the stack has `close` and `block` but no passive role; Tooltip currently
  consumes Escape ahead of associated owners;
- no Tooltip or HoverCard pins open on a press yet (`component:Tooltip` FR9,
  `component:HoverCard` FR9);
- no shared owner/branch association graph or outside-branch resolver exists;
- DropdownMenuSubMenu has a local parent-close chain, but outside channels do not
  consume shared branch identity;
- native light dismiss has gesture memory, and menu hover has re-hover
  suppression, but local backdrop, touch, swipe, and manual outside paths do not
  share branch claims;
- body/root Toast hosts remain behind active native modal dialogs;
- Toast state lives inside ToastViewport rather than above a movable outlet;
- CommandPalette uses native Dialog but handles Escape locally; and
- reduced fallback behavior exists in code but is not fully described in public
  docs.

### Migration and adoption plan

1. **Owner and branch model.** Extend layer registration with active, blocking,
   and passive roles plus parent-owner and branch-root association. Add pure
   eligible-owner and outside-branch resolvers. Preserve the current
   Escape/platform contract for existing active/blocking members while migrating.
2. **Eligibility migration.** Make an unpinned Tooltip passive and a pinned
   Tooltip active, and update Tooltip-over-owner tests. Keep HoverCard active because it can own interactive content. Migrate
   CommandPalette and the local Escape implementations tracked by
   `family:overlay-dismissal` onto eligible-owner delivery.
3. **Branch migration.** Project DropdownMenuContext's root/submenu chain into a
   shared branch. Add independent child branches for nested Popovers. Migrate
   native auto light dismiss, ContextMenu outside press, dialog backdrop, touch,
   and sheet swipe/scrim channels without changing their component policies.
4. **Gesture claims.** Generalize current Layer close memory into a branch claim
   recorded before pointer-driven closure. Require every associated reopen path
   to consult it. Preserve menu-hover's exposure suppression.
5. **Global native host.** Add root and modal outlets with activation order. Lift
   Toast state above the render outlet, render its manual-popover viewport inside
   the selected outlet, and preserve state through rehosting. Keep CommandPalette
   on native Dialog and verify it as a later active modal owner.
6. **Support projection.** Update public Layer/Popover/component docs with the
   full native contract and reduced fallback. Add the browser matrix required
   below.
7. **Architecture promotion.** As each requirement ships, update
   `architecture:layer-runtime` from observed gaps to shipped invariants. Move
   this spec to `shipped` only after every completion criterion is met.

No migration step adds a broad public API by default. A new public prop or hook
still follows `architecture:public-component-api` and `spec:AST-002`.
Interaction modality continues to follow `architecture:interaction-modality`.

## Verification

| Contract  | Verification                                               | Representative states                                                                                        | Mutation or failure expectation                                                                                  |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| FR1–FR6   | Pure registry/resolver tests plus family interaction tests | active, blocking, passive Tooltip, pinned Tooltip and HoverCard over a Dialog, visual-only, controlled owner | Passive surface wins, a pinned surface lets Escape reach the owner beneath, blocker leaks, or wrong owner closes |
| FR7–FR10  | Branch resolver tests and real-browser outside interaction | root menu with two submenu levels; parent + child Popover; associated trigger                                | Outside root leaves submenu open, or child-only outside closes parent                                            |
| FR11–FR14 | Gesture-counter and browser event-order tests              | native light dismiss before/after click; menu button; hover-open; touch; backdrop; swipe                     | Same gesture reopens any associated trigger or exposed hover reopens panel                                       |
| FR15–FR20 | Chromium/WebKit native host tests                          | Toast at root; Toast through one/two modals; CommandPalette above modal; ordinary local Popover              | Global surface is behind/inert, loses state, or ordinary overlay becomes global                                  |
| FR21–FR23 | Supported/unsupported browser matrix and public-doc checks | anchor/fixed/custom; auto/manual; explicit controls; absent feature APIs                                     | Docs promise equivalence or reduced fallback is unusable                                                         |
| IR1–IR3   | API/type tests and mutation tests for resolvers/claims     | one-at-a-time channel versus branch channel                                                                  | One topmost query is reused for outside branches or timestamps replace identity                                  |
| IR4, IR5  | Public-surface snapshot and atomic change review           | local Popover, global Toast, global CommandPalette                                                           | Generic global prop appears or unrelated behaviors are coupled in one change                                     |

### Completion criteria

This spec is complete only when:

- an unpinned Tooltip is passive in Escape/platform and outside-branch
  coordination, and a pinned Tooltip or HoverCard takes Escape first;
- eligible-owner and associated-branch operations are shared and adopted by all
  members named by `family:overlay-dismissal` for their relevant channels;
- outside a dropdown/menu root closes its entire open submenu cascade, while
  child-branch outside behavior preserves its parent when appropriate;
- every pointer-driven branch dismissal uses the branch gesture claim and every
  associated reopen path honors it;
- Toast remains visible and operable above zero, one, and two active native
  modals without losing entries, timers, theme, or focus handoff;
- normal CommandPalette opens above an existing modal and participates as the
  selected active owner;
- ordinary overlays remain local and cannot opt into global hosting without an
  approved record change;
- public docs describe full native support and the reduced fallback accurately;
- required Chromium and WebKit browser matrices pass; and
- `architecture:layer-runtime` and `family:overlay-dismissal` reflect the shipped
  implementation without listing these items as gaps.

## Decision log

### DEC-1 — Dismissal follows eligible interaction ownership

**Reference:** `spec:AST-003/DEC-1`
**Decider:** `cixzhang`, `2026-08-30`

Escape and platform close select the topmost eligible active or blocking owner,
not the topmost visible or registered surface. An unpinned Tooltip is passive
and cannot shield a Popover, menu, Dialog, or associated interactive element
beneath it; a pinned one is the person's own interaction (DEC-6).

Rejected: letting every visible transient layer consume one Escape. That makes
supplementary information block the interaction the user is trying to dismiss.

### DEC-2 — Outside interaction resolves associated branches

**Reference:** `spec:AST-003/DEC-2`
**Decider:** `cixzhang`, `2026-08-30`

Outside interaction has different scope from Escape. Outside a dropdown or menu
cascade closes the whole associated root branch, including every open submenu.
Interaction outside only a distinct nested child branch closes that child while
preserving the parent when the event remains inside the parent branch.

Rejected: reusing one visually topmost gate for every channel. One-at-a-time and
branch-scoped interactions have different user intent.

### DEC-3 — Dismissing gestures are claimed across the branch

**Reference:** `spec:AST-003/DEC-3`
**Decider:** `cixzhang`, `2026-08-30`

A pointer gesture that dismisses a branch is claimed before close. It cannot
continue into an associated trigger and immediately reopen any surface in that
branch. Menu-hover also suppresses the synthetic hover created when a closing
panel exposes its trigger.

Rejected: timestamp-only debounce. Gesture identity must survive either browser
event order without delaying a deliberate next interaction.

### DEC-4 — Selected global systems use native above-modal hosting

**Reference:** `spec:AST-003/DEC-4`
**Decider:** `cixzhang`, `2026-08-30`

Toast and normal CommandPalette are the current selected global systems. They may
and must appear above active native modal dialogs through browser-valid native
hosting. This does not make ordinary overlays global.

Rejected: relying on a body portal or high `z-index`. Neither can cross a native
modal top-layer boundary.

### DEC-5 — Full anchored behavior depends on native platform features

**Reference:** `spec:AST-003/DEC-5`
**Decider:** `cixzhang`, `2026-08-30`

Native Popover API plus CSS Anchor Positioning define the full anchored-layer
contract. Unsupported browsers receive a documented usable reduced fallback,
not equivalent positioning, stacking, association, or dismissal behavior.

Rejected: describing the current `display` fallback as a polyfill. It does not
implement the missing browser systems.

### DEC-6 — A pinned layer is the person's own interaction

**Reference:** `spec:AST-003/DEC-6`
**Decider:** `cixzhang`, `2026-10-31`

A Tooltip or HoverCard that a press pinned open is something the person asked
to keep, so it is an active owner and Escape closes it before the owner beneath
it. A Tooltip that only previews on hover or focus stays passive.

Rejected: keeping every Tooltip passive, which lets Escape close a Dialog behind
a tip the person pinned.

## Open questions

None.
