---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-044
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [cixzhang, imdreamrunner]
affects_architecture:
  [architecture:layer-runtime, architecture:public-component-api]
affects_families: [family:overlay-dismissal]
affects_contributing: []
affects_consumer_docs: [BottomSheet, BottomSheetSwitcher]
---

# BottomSheetSwitcher ordered path and overlay policy system spec

## Intent

Evolve `BottomSheetSwitcher` — do not add a new `BottomSheetStack` component —
so the existing host also supports drill-in flows where a new bottom sheet
appears above the current sheet and the covered sheets recede to preserve
visible context. The caller owns one ordered path of stable sheet ids; the host
owns presentation, focus, dismissal routing, and motion
for that path.

The switcher accepts both its released singular prop and a new canonical list
prop. Singular remains a length-zero-or-one projection of the same list, so
existing consumers work unchanged:

```tsx
// Canonical list form (new)
const [activeSheets, setActiveSheets] = useState<ReadonlyArray<string>>([]);

<BottomSheetSwitcher
  activeSheets={activeSheets}
  onActiveSheetsChange={setActiveSheets}
  hasScrim={false}
  finalFocusRef={openerRef}>
  <BottomSheet sheetId="issues" label="Issues">
    <IssueList
      onSelectIssue={issueId => setActiveSheets(['issues', `issue:${issueId}`])}
    />
  </BottomSheet>

  <BottomSheet sheetId="issue:login-timeout" label="Login timeout">
    <IssueDetails
      onBack={() => setActiveSheets(current => current.slice(0, -1))}
      onCloseAll={() => setActiveSheets([])}
    />
  </BottomSheet>
</BottomSheetSwitcher>;

// Legacy singular form (released, unchanged meaning)
<BottomSheetSwitcher activeSheet={sheet} onActiveSheetChange={setSheet}>
  {/* identical children; equivalent to activeSheets = sheet == null ? [] : [sheet] */}
</BottomSheetSwitcher>;
```

`activeSheets` is ordered bottom-to-top. `[]` closes the host, appending one id
pushes one sheet, removing the final id reveals the previous sheet, and replacing
a suffix changes branch. The same value can be serialized into route or workflow
state without reconstructing hidden opening chronology. Because the host sheet
is already in this list, a sheet opened by the switcher opens a stacked sheet
by appending to its own host's list — no nested coordinator, promotion, or
second host is required.

The proposal adds one caller-owned concept and reuses one released one:

1. **Path:** which registered sheets are open, and in which order (`activeSheets`).
2. **Presentation:** the released `hasScrim` concept — `true` selects the modal,
   scrim-backed host (native backdrop, focus containment, scroll lock); `false`
   selects the non-modal host (no backdrop, page remains interactive).

Splitting paint from modality (a separate `modality` prop expressing
modal-without-scrim or non-modal-with-dimming) is explicitly deferred: no
consumer in this proposal requires either combination, and adding it would
reinterpret released `hasScrim={false}` callers. It remains a recorded
`AST-002/FR16` tension for a future family-wide compatibility decision.

`finalFocusRef` supplies a stable final destination when the element that opened
the first sheet may be replaced.

[PR #5813](https://github.com/facebook/astryx/pull/5813) establishes feasibility
for the ordered-path model and one shared host. It is a prototype, not authority.
This record retains the released coupling of scrim paint and modal
presentation (see DEC-2) rather than splitting it in this change.

Silk (`@silk-hq/components`) was evaluated and rejected as the model: it has no
coordinator or declared order — each sheet owns an independent `presented`
boolean, front/covered is derived from presentation chronology (simultaneous
presentation is unspecified), and `SheetStack` only groups sheets for
cumulative-progress stacking animation. See DEC-1.

## Non-goals

- Implementing or merging PR #5813 in this specification pull request.
- Adding an imperative public `push()`, `pop()`, router, history object, or stack
  ref. Callers update the controlled path with ordinary state operations.
- Inferring logical order from independent child `isOpen` booleans, React child
  order, mount order, DOM order, or a module-global registry.
- Adding a new `BottomSheetStack` component. A separate coordinator cannot
  compose with a sheet the switcher already opened (the base sheet would belong
  to neither path); extending the switcher keeps one host, one list, and one
  dismissal/focus owner for replace and drill-in flows alike.
- Changing standalone `BottomSheet` defaults or retroactively splitting its
  released `hasScrim` behavior. A family-wide migration needs a separate
  compatibility decision.
- Adding built-in Back or Close-all controls. Caller content owns those actions;
  the host owns the state request and focus behavior they trigger.
- Exposing Silk-style arbitrary per-call animation functions, transition
  progress, depth callbacks, transform values, z-index values, or internal
  registration APIs.
- Settling exact recede distance, scale, corner treatment, visible depth cap, or
  public theme variables before design and theming review.
- Supporting a caller-supplied portal container or region-scoped stack. The
  initial proposal is a viewport bottom sheet.
- Treating a React portal as a modal boundary or bypassing the shared layer and
  dismissal contracts.

## Requirements

The requirements below describe the candidate contract. While this record has
`authority: draft`, they are review material rather than implementation policy.

### Public concepts and ownership

- **FR1 — One controlled value owns the logical path.**
  `activeSheets: ReadonlyArray<string>` MUST be the only source of truth for which
  sheets belong to the open path and their bottom-to-top order. An empty array
  means closed. The host MUST NOT maintain a second consumer-visible navigation
  history or infer additional open sheets. The released singular `activeSheet`
  is a projection of this value (`null` ⇔ `[]`, `id` ⇔ `[id]`), never a second
  source of truth.
- **FR2 — Change requests preserve controlled ownership.**
  `onActiveSheetsChange(nextIds, details)` MUST request a new path after a
  component-owned dismissal action, with `details: {reason: 'escape' | 'scrim'
| 'swipe', dismissedSheetId}`. Value and callback are required as a pair
  (list form) or as the legacy singular pair (`activeSheet` +
  `onActiveSheetChange`, which receives `next.at(-1) ?? null` and no details);
  there is no uncontrolled mode. Supplying both forms is invalid: the host
  warns in development and the list form wins. The host MUST NOT mutate caller
  state or remain logically advanced when the caller keeps the prior value. A
  prop update MUST NOT echo through a callback merely because it differs from
  the previous prop.
- **FR3 — Sheet ids identify registered destinations.** A participating
  `BottomSheet` MUST provide a non-empty `sheetId` that is unique and stable for
  its mounted lifetime within the nearest controller. Participating destinations
  register beneath the controller but outside another participating sheet's
  content. Sheet content resets its parent's ownership; a nested
  `BottomSheetSwitcher` starts a new scope so one sheet belongs to exactly one
  nearest controller. Stacking within this flow is expressed by appending to
  this switcher's list, never by nesting a second coordinator in a sheet. React child order and DOM order MUST
  NOT affect the path.
- **FR4 — Path edits have stable meanings.** Appending one valid id means push;
  removing the final id means one-level pop; replacing a suffix means branch
  replacement; and `[]` means close all. A caller MAY jump to any valid ordered
  path. The host MUST converge to that exact path even when the edit is not one
  of the animated single-level cases.
- **FR5 — Scope is controller-local.** Separate roots MUST NOT affect one
  another's logical depth, recede presentation, focus memory, validation, or
  dismissal request. They remain separate surfaces: Escape and platform close
  are ordered by `family:overlay-dismissal`, while each host owns its paint and
  outside interaction. Current `architecture:layer-runtime/INV9` supplies no
  shared visual or outside-interaction ordering.
- **FR6 — Child sheet configuration remains local.** A participating
  `BottomSheet` continues to own its `sheetId`, `label`, `purpose`, content,
  height, snap points, and panel styling. Its participating props variant MUST
  type `isOpen`, `onOpenChange`, `hasScrim`, and `finalFocusRef` as unavailable;
  the root owns path, presentation, and final focus return.
- **FR7 — Presentation follows the released `hasScrim` concept.**
  `hasScrim?: boolean` defaults to `true` and keeps its shipped switcher meaning
  at every path length. `true` makes content outside the presented path
  unavailable to pointer, keyboard, scrolling, and the accessibility tree for
  the rendered lifetime; `false` leaves that content available.
- **FR8 — Scrim paint and modal presentation stay coupled in this change.**
  `hasScrim=true` uses `showModal()`, a visible native backdrop, focus
  containment, and scroll locking together; `hasScrim=false` uses `show()`
  with no backdrop, no scroll lock, and an interactive page. No `modality`
  prop is added; modal-without-scrim and non-modal-with-dimming are not
  expressible under this proposal.
- **FR9 — Both presentation modes are complete.** Modal and non-modal paths
  MUST each have matching pointer, keyboard, scroll, focus, and accessibility
  behavior at every depth. A stacked path MUST NOT create an invisible
  full-page dismissal plane in either mode.
- **FR10 — Final focus is a root policy.**
  `finalFocusRef?: React.RefObject<HTMLElement | null>` identifies the preferred
  destination after the path reaches `[]` and exit completes. The caller owns
  this identity because a router or workflow may replace the original opener;
  the host cannot derive the replacement reliably.
- **FR11 — Public inputs keep one responsibility.** `activeSheets` owns the
  path, `hasScrim` owns presentation (paint and modal host, per FR8), and
  `finalFocusRef` owns the preferred final destination. No new input may
  silently reinterpret the released presentation contract.

### Validation and controlled reconciliation

- **FR12 — Invalid paths fail safe.** The presented path MUST be the longest
  leading prefix whose ids are non-empty, unique in the value, and resolve to
  exactly one registered sheet. Presentation stops before the first invalid or
  unavailable id. The host MUST NOT show a blank blocking dialog, guess another
  destination, reorder ids, or continue with a disconnected suffix.
- **FR13 — Invalid input remains caller-owned.** In development, the host MUST
  warn with the first invalid index and reason: empty id, repeated path id,
  unknown id, or duplicate registration. It MUST NOT rewrite
  `activeSheets` or call `onActiveSheetsChange` solely to normalize an invalid
  prop. A later valid render uses the requested valid path normally.
- **FR14 — Dynamic registration uses the same rule.** Removing or changing a
  registered sheet while its id is in the path immediately makes that id and its
  suffix unavailable under FR12. Re-registering a unique matching id may restore
  the requested path. Focus and presentation MUST follow only the currently
  presented valid prefix; stale registrations MUST NOT remain interactive.
- **FR15 — Registration ambiguity never picks a winner.** Two sheets with the
  same id in one ownership scope make that id unavailable until the ambiguity is
  removed. Source order, mount order, or the most recent registration MUST NOT
  decide which content receives focus or interaction.

### Presentation and path transitions

- **FR16 — One host presents the path.** The switcher owns one host element, one
  scrim, one focus boundary, and—when `hasScrim`—one native document-modal boundary
  and one scroll lock. `hasScrim=true` uses a native modal dialog; `hasScrim=false` uses
  a non-modal dialog that does not enter the browser top layer and therefore
  cannot outrank an unrelated active native modal. Participating sheets MUST NOT
  create nested native dialogs merely because the logical path has several
  levels.
- **FR17 — Only the top sheet is active.** The last id in the presented valid
  prefix supplies the active panel, accessible name, purpose, direct pointer and
  keyboard interaction, swipe gesture, and implicit dismissal policy. Covered
  sheets MUST NOT receive focus, pointer input, swipe dismissal, or direct
  assistive-technology navigation.
- **FR18 — Covered sheets preserve local state.** A covered sheet remains
  mounted through ordinary pushes and pops so caller-owned form, selection,
  scroll, and component state survive. It is marked inert and accessibility
  hidden while covered. A caller that removes the child still owns that
  unmount.
- **FR19 — Push preserves visible origin.** On one-id append, the new top panel
  enters above the previous top. Each visible covered panel receives the
  stack-owned recede treatment for its logical depth. The panel becoming covered
  MUST be inactive before the entering panel can receive input.
- **FR20 — Pop reveals one level.** On one-id suffix removal, only the former top
  exits. The newly revealed top returns from its covered treatment and becomes
  active after ownership transfers. A stale swipe, motion completion, or close
  request from the exiting sheet MUST NOT pop the next level.
- **FR21 — Arbitrary path edits converge deterministically.** Multi-pop, branch
  replacement, reorder, and closed-to-deep-link edits MUST reach the requested
  valid path without rendering removed branches as active or promising bespoke
  navigation choreography. The implementation MAY reduce or skip intermediate
  motion, but logical ownership, presentation, focus, and accessibility MUST match
  the final path.
- **FR22 — Rapid updates are generation-safe.** A newer path supersedes pending
  transition completions from an older path. Old timers, transition events,
  gesture callbacks, registrations, or focus work MUST NOT change the newer
  path, hide its top sheet, release its modal boundary, or restore stale focus.
- **FR23 — Exit keeps the visible contract.** When the requested path becomes
  `[]`, the last visible panel, presentation, scrim, content, and focus boundary
  remain coherent through exit. Background interaction MUST NOT resume beneath a
  visibly leaving modal stack. Logical dismissal requests remain based on the
  latest controlled prop.
- **FR24 — Reduced motion changes time, not state.** Under reduced-motion
  preferences, recede, enter, return, and exit motion may collapse to immediate
  state changes. Path ownership, focus, presentation semantics, dismissal,
  and covered-sheet accessibility MUST remain identical.
- **FR25 — Visual depth is bounded independently of logical depth.** The logical
  path may contain any supported number of unique sheets. The implementation MAY
  cap or compress the number of visually distinguishable covered levels for
  legibility and performance, but every covered id retains the same inactive and
  mounted semantics. Exact geometry and any theme seam require OQ5.

### Dismissal and Back behavior

- **FR26 — Implicit dismissal pops one visible level.** When the top sheet
  permits the initiating channel, Escape, platform close, visible modal-scrim
  activation, or a completed top-sheet swipe MUST request the presented valid
  prefix without its final id. If the requested value contains an invalid suffix,
  one dismissal still removes one currently visible level. With one presented id,
  the result is `[]`. Close-all remains an explicit caller action that sets `[]`.
- **FR27 — Purpose is read from the top sheet.** `purpose="info"` permits Escape,
  platform close, visible modal-scrim activation, and swipe; `purpose="form"`
  permits Escape and platform close but blocks scrim and swipe;
  `purpose="required"` blocks every implicit channel. For Escape and platform
  close, a required top sheet registers with the family's `block` behavior so the
  request is consumed rather than delivered to a member behind it under
  `family:overlay-dismissal/FR2`. Covered-sheet purposes have no effect until
  that sheet is topmost. Purpose never blocks a caller-supplied path update,
  including `[]`.
- **FR28 — Scrim dismissal follows presentation.** Only activation of a
  visible modal scrim (`hasScrim=true`) may request a pop. With
  `hasScrim={false}` there is no scrim and no outside-pointer dismissal plane. Before a scrim-driven pop changes visibility, the switcher
  records the branch gesture claim required by `spec:AST-003/FR11–FR13` so the
  same physical gesture cannot reopen an associated trigger. Escape, explicit
  caller actions, and swipe remain separate channels.
- **FR29 — One physical request affects one surface.** The switcher MUST
  register with the shared dismissal owner as one active or blocking surface and
  MUST provide `LayerDepthProvider` to its content so nested surfaces order ahead
  of it under `family:overlay-dismissal/FR4`. One Escape or platform close MUST
  NOT pop two sheet levels or close a nested surface and a sheet together.
- **FR30 — Composition Escape is not dismissal.** Escape used to cancel active
  IME composition MUST be consumed without requesting a path change. Content that
  handles Escape first keeps the shared family contract's existing precedence.
- **FR31 — Swipe belongs to the active panel.** Only the top `info` sheet may
  drive or complete swipe dismissal. A gesture begun on a sheet that becomes
  covered, removed, invalid, or superseded MUST cancel without changing the
  current path. Before a completed swipe changes visibility, the switcher records
  the branch gesture claim required by `spec:AST-003/FR11–FR13`.
- **FR32 — Controlled refusal stays open.** A dismissal callback requests a path;
  it does not close the native host independently. If the caller retains the old
  path, the same top sheet remains presented and the host restores any transient
  visual state without firing the callback twice for one dismissal gesture. A
  later Escape, swipe, platform close, or scrim activation is a new request.

### Focus and accessibility

- **FR33 — Initial focus enters the top sheet once.** On `[]` to non-empty,
  the host focuses the top panel's first `[data-autofocus]` descendant. When `hasScrim=true` it captures the currently focused opener and falls back to the panel itself
  when no autofocus descendant exists. With `hasScrim=false` the host honors `[data-autofocus]`
  but never focuses the panel itself, matching current standalone BottomSheet
  behavior. A deep-linked initial path focuses only its top sheet; covered levels
  MUST NOT receive transient focus.
- **FR34 — Push records a recoverable intra-stack destination.** Before a push
  moves focus into the new top, the host records the focused element in the sheet
  becoming covered when that element belongs to it. The record is internal and
  valid only while the element remains connected, rendered, focusable, and owned
  by that sheet.
- **FR35 — Pop restores within the revealed sheet.** After the revealed sheet
  becomes active, focus returns to its recorded eligible descendant. If none is
  eligible, the host focuses its first `[data-autofocus]` descendant in either
  mode, and the panel itself only when `hasScrim=true`. Focus MUST NOT land in another
  covered sheet or page background while the flow remains modal.
- **FR36 — Final return has a safe precedence.** After exit completes, an
  eligible `finalFocusRef.current` wins; otherwise an eligible opener captured on
  the empty-to-non-empty transition receives focus. If neither is eligible, the
  host does not focus a disconnected, hidden, inert, disabled, or covered node.
  A `hasScrim=false` close MUST NOT steal focus that has already moved outside the stack.
- **FR37 — One accessible dialog describes the active task.** The shared host
  exposes the top sheet's non-empty `label` as its accessible name. It uses
  `role="alertdialog"` when the top sheet has `purpose="required"` and ordinary
  dialog semantics for `form` and `info`; `aria-modal="true"` is present only when
  `hasScrim=true`. Covered and non-path sheets MUST not add parallel dialog boundaries
  or remain exposed as active content.
- **FR38 — Modal semantics follow `hasScrim`.** `hasScrim=true` establishes
  the document modal boundary, focus containment, page unavailability, scroll
  locking, and matching modal semantics. `hasScrim=false` claims none of those
  guarantees. This coupling is the released contract retained by DEC-2.
- **FR39 — Focus state is pruned with identity.** Removing, invalidating, or
  ambiguously registering a sheet discards focus memory that can no longer be
  proven to belong to that sheet. Reusing the same string for replacement content
  MUST NOT focus an element retained from the previous registration lifetime.

### Lifecycle, SSR, and resources

- **FR40 — Initial controlled state hydrates without false layers.** Server output
  MUST NOT expose several active dialogs or interactive covered sheets. Hydrating
  a non-empty valid path presents one host and applies focus once on the client.
  An empty initial path performs no dialog presentation or focus work.
- **FR41 — Policy changes remain coherent while open.** A live `hasScrim`
  change MUST reconcile paint, native modal/non-modal presentation, focus
  containment, accessibility state, visible-scrim dismissal, and scroll locking
  without changing the path, firing a consumer close, replacing the captured
  final-focus target, or exposing background interaction between modes. This
  preserves the shipped switcher's live-presentation behavior at any depth.
- **FR42 — Closed roots have bounded idle cost.** An empty switcher may retain local
  child registration needed for validation, but MUST NOT register itself with the
  shared dismissal stack, install a component-local document listener, hold a
  focus trap or scroll lock, run an animation loop or observer, or retain a
  rendered dialog lifetime. Cost MUST NOT scale per animation frame with
  registered or covered sheet count.
- **FR43 — Motion avoids continuous measurement.** Recede and path transitions
  MUST use state and CSS-native motion rather than ResizeObserver, per-frame DOM
  measurement, or React state updates driven by animation frames. Measurement is
  allowed only when an existing BottomSheet size or snap-point contract requires
  it and MUST remain bounded to that owner.

### Implementation boundaries

- **IR1 — Shared architecture stays authoritative.** The switcher may own path
  interpretation, panel phases, focus memory, scrim policy, and swipe-to-pop.
  Shared Escape/platform-close ordering remains with
  `family:overlay-dismissal`; native hosting and top-layer distinctions remain
  with `architecture:layer-runtime`; and the accepted eligible-owner,
  associated-branch, and gesture-claim model remains with `spec:AST-003`.
  The switcher MUST adopt that shared model as it ships rather than creating a
  parallel registry or gesture identity.
- **IR2 — One controller owns each sheet.** Internal contexts MUST make nearest
  controller ownership unambiguous and reset ownership inside participating
  sheet content. Two switcher scopes MUST NOT both register or animate the same
  sheet instance, and the singular and list prop forms MUST NOT drive separate
  internal paths.
- **IR3 — Logical state and transition state stay separate.** Internal retained
  panels and exit phases may outlive a requested path for animation, but they
  MUST NOT become a second logical path or alter callback payloads.
- **IR4 — Presentation implementation follows `hasScrim`.** `hasScrim` is the
  source of truth for presentation: scrim opacity, native backdrop styling,
  focus containment, `show()` versus `showModal()`, inertness, and scroll
  locking are all derived from it. No parallel internal modality flag may
  diverge from it.
- **IR5 — Development diagnostics are stable and bounded.** Invalid-id warnings
  identify the root cause without including caller content, fire at most once per
  distinct invalid condition until it clears, and are absent from production.
- **IR6 — Consumer docs teach state operations, not internals.** Documentation
  MUST show open, push, Back, branch replacement, and Close-all state updates;
  define presentation, focus return, purpose, and invalid ids; and distinguish
  the list form from the singular form. It MUST NOT teach registries, phase machines, host wrappers,
  or transform implementation as API.
- **IR7 — Visual hooks need separate admission.** A public CSS variable, target,
  data attribute, depth value, or animation callback requires its own design,
  theming, compatibility, and `spec:AST-002` admission. The initial implementation
  may not expose an internal depth mechanism accidentally as supported API.
- **IR8 — The host is the DOM contract surface.** `BottomSheetSwitcherProps` extends
  `BaseProps<HTMLDialogElement>`, accepts `ref?: React.Ref<HTMLDialogElement>`, and
  sends supported DOM, ARIA, event, class, style, and `xstyle` inputs plus the ref
  to the shared host element. Switcher-owned dialog semantics and behavior retain the
  precedence required by `architecture:public-component-api`.

### Platform support

- Supported feature/engine floor: the affected Core package's current browser
  support contract, including native dialog and standards-based `inert` on the
  modal path.
- Unsupported behavior: a browser path that cannot establish the promised modal
  boundary MUST NOT render modal-looking UI while leaving background content
  interactive. It must fail closed, use an explicitly documented equivalent
  path, or hold release until support exists. A non-modal switcher does not enter the
  browser top layer and cannot be presented as operable above an unrelated active
  native modal; public docs MUST state that boundary.
- Browser evidence: native dialog/top-layer behavior, focus entry and return,
  accessibility-tree exclusion, inertness, pointer hit testing, scroll locking,
  gesture cancellation, transition timing, reduced motion, and live presentation
  reconciliation require real Chromium and real Safari evidence. jsdom and
  Playwright WebKit are not substitutes for those browser-owned claims.

## Current-state impact

Current `main` has two BottomSheet ownership modes:

- standalone `BottomSheet` uses `isOpen` and `onOpenChange`, owns one native
  dialog, and currently uses `hasScrim` to select scrim paint, modal presentation,
  focus behavior, and body scroll locking together; and
- `BottomSheetSwitcher` owns one shared dialog for exactly one active `sheetId`,
  retains the previous sheet during replacement motion, and gives participating
  children `sheetId` instead of independent open state.

Neither mode represents a visible multi-level path. A product can coordinate
independent standalone booleans, but ordering, branch replacement, deep linking,
and cross-sheet focus recovery then live outside the component contract. A
module-global opening registry can infer chronology, but it cannot distinguish
route intent or unrelated product flows without another public scope concept.

The proposal extends the existing controller in place and reuses the existing
participating child shape. Exactly one value/callback pair is used:

```ts
interface BottomSheetSwitcherProps extends BaseProps<HTMLDialogElement> {
  ref?: React.Ref<HTMLDialogElement>;
  // Canonical list form
  activeSheets?: ReadonlyArray<string>;
  onActiveSheetsChange?: (
    nextIds: ReadonlyArray<string>,
    details: {reason: 'escape' | 'scrim' | 'swipe'; dismissedSheetId: string},
  ) => void;
  // Released singular form (deprecated alias of a length ≤ 1 list)
  activeSheet?: string | null;
  onActiveSheetChange?: (sheetId: string | null) => void;
  hasScrim?: boolean;
  finalFocusRef?: React.RefObject<HTMLElement | null>;
  onCancel?: (event: SyntheticEvent<HTMLDialogElement>) => void;
  children: React.ReactNode;
}
```

The candidate passes `spec:AST-002`'s need gate in three distinct cases:

- **Path.** Two renders with the same registered sheets may represent different
  restored routes or branches and therefore require different ordered paths. The
  caller owns route and workflow state; the host cannot derive it from mounted
  children, DOM order, or opening chronology.
- **Presentation.** The same path and content may be a blocking task in one
  product flow and an inspectable non-modal surface in another. The caller owns
  that choice through the released `hasScrim` prop; the host cannot infer it
  from content or viewport. No new concept is introduced for this axis.
- **Final focus.** Two otherwise identical closes may return to the captured
  opener or to a replacement row/control installed by routing. The caller knows
  the replacement identity; the host can validate an element but cannot derive
  which replacement represents the continued task.

The contract gate is enforceable within explicit limits: registered ids and the
controlled value determine one validated prefix; a `hasScrim` native modal dialog enforces
modal background unavailability; a non-modal dialog leaves the document
available but does not promise to outrank an unrelated native modal; `hasScrim`
selects both the modal host and its interaction channels together; and
final-focus candidates are used only while
connected and eligible. The component derives internal phases, visual depth,
active accessibility state, owner role, and fallback focus from these concepts,
so the proposal does not expose them.

[PR #5813](https://github.com/facebook/astryx/pull/5813) implements the ordered
path with the same released `hasScrim` coupling. Its unit and browser evidence
are useful feasibility inputs, but implementation details and prototype results
are not accepted contract. The independent modality/scrim shape in the public
Drawer exploration [#5550](https://github.com/facebook/astryx/pull/5550) is
deferred, not adopted here (DEC-2).

`spec:AST-003` is current, accepted, and not yet fully implemented. It owns the
eligible-owner, associated-branch, and same-gesture claim model that the switcher's
Escape, platform-close, scrim, and swipe paths must adopt as those shared pieces
ship. AST-044 defines the switcher's stacked-path policy; it does not create competing
owner, branch, or gesture infrastructure.

When this ships, `family:overlay-dismissal` records the evolved
`component:BottomSheetSwitcher` as a shared-owner adopter for stacked paths.
The switcher supplies `LayerDepthProvider` to nested content. Existing
standalone BottomSheet adoption gaps remain independently tracked; shipping
stacked paths does not falsely mark that sibling path complete.

### Compatibility and migration

- The list form is additive and not yet released. Singular consumers keep
  `activeSheet`/`onActiveSheetChange` with identical behavior at path length
  ≤ 1 (open, replace, dismiss-to-`null`); no consumer is forced to migrate.
  `hasScrim` keeps its released meaning and default at every path length; there
  is no reinterpretation and no presentation migration.
- Adoption is per flow and incremental: rename `activeSheet` to
  `activeSheets={[id]}`, then append for drill-in, replace the suffix for
  branch changes, slice for Back, and `[]` for Close all. A mechanical codemod
  can perform the rename; intended branches and focus-return policy remain
  caller decisions it cannot infer.
- Existing standalone `BottomSheet.hasScrim` remains a combined released concept.
  Any future modality split must not silently rename or reinterpret it. A later family-wide split requires its own compatibility classification,
  consumer migration, tests, docs, and Changeset.
- This specification-only pull request changes no package, runtime, public API,
  generated artifact, or consumer behavior and therefore has no Changeset.

### Rollout order

1. Resolve OQ1–OQ5 and promote this record only with exact-head owner approval.
2. Update `packages/core/src/BottomSheet/BottomSheetSwitcher.spec.md`
   (`component:BottomSheetSwitcher`) and the draft `component:BottomSheet`
   contract for the accepted list form. Project accepted component-local API,
   behavior, accessibility, design, and theming decisions without copying this
   system rationale.
3. Record the evolved switcher in `family:overlay-dismissal.members` as a
   shared-owner adopter, and project `spec:AST-003` owner, branch, depth, and
   gesture-claim requirements into implementation evidence.
4. Align PR #5813's prototype host with the accepted contract — as
   `BottomSheetSwitcher`, not a new component — especially dual-prop
   reconciliation, invalid-id handling, focus restoration,
   shared dismissal, rapid updates, and SSR.
5. Add consumer docs and examples that teach the singular→list adoption and
   cover push, Back, branch replacement, Close all, deep links, and policy
   combinations.
6. Run the unit, mutation, performance, real-browser, accessibility, and visual
   matrices below. Update current architecture and family records only as shipped
   behavior and verification become true.
7. Publish the additive Core API with its release Changeset after the component
   contracts, docs, and required evidence are complete.

## Verification

| Contract  | Verification                                                                    | Representative states                                                                                                                                                                           | Mutation or failure expectation                                                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR6   | Public type, ownership-scope, and controlled-state tests                        | empty, one/two/three levels; push, pop, branch, reorder, Close all; nested and sibling roots; both prop forms and their conflict                                                                | A second history appears, child order changes depth, two controllers own one sheet, or an existing child prop becomes valid in the wrong host.                                                                                                        |
| FR7–FR11  | Policy matrix in unit and real-browser tests                                    | `hasScrim` true/false at depths 0/1/2+; omitted defaults; explicit/detached final focus                                                                                                         | Background channels disagree between depths, or a new input silently reinterprets released presentation.                                                                                                                                              |
| FR12–FR15 | Validation, dynamic registration, and production-build tests                    | empty/repeated/unknown ids; duplicate registration; removal, replacement, and recovery                                                                                                          | A blank modal opens, an ambiguous sheet wins by mount order, an invalid suffix stays interactive, the prop is rewritten, or production emits diagnostics.                                                                                             |
| FR16–FR25 | Transition reducer, mutation tests, visual snapshots, and real-browser geometry | push, pop, multi-pop, branch replacement, deep link, rapid reversal, exit, reduced motion, deep path                                                                                            | Two native dialogs appear, covered content unmounts or stays interactive, stale completion wins, background releases early, or logical depth is capped with visual depth.                                                                             |
| FR26–FR32 | Dismissal family, purpose, gesture, and controlled-refusal tests                | every purpose × Escape/platform/scrim/swipe; IME; Popover nested under the depth provider; ignored callback; scrim/swipe gesture continuing onto the opener; gesture interrupted by path update | One request pops twice, an invisible/non-modal scrim dismisses, a covered swipe wins, required closes, native state overrides the caller, the same physical press reopens the stack, or nested Popover Escape closes the stack when depth is removed. |
| FR33–FR39 | Focus unit tests plus real Chromium/Safari and accessibility-tree evidence      | pointer/keyboard open; push/pop; deep link; invalid removal; detached/hidden final target; non-modal outside focus                                                                              | Covered content receives focus, pop returns to stale content, final close steals focus when `hasScrim=false`, or modal semantics diverge from `hasScrim`.                                                                                             |
| FR40–FR43 | SSR/hydration, resource instrumentation, and reduced-motion browser tests       | empty/non-empty initial path; 1/10/100 registrations; live `hasScrim` changes; interrupted exit                                                                                                 | Server exposes multiple active dialogs, hydration focuses covered levels, closed roots retain active resources, scroll/animation drives React renders, or policy flips expose a live background frame.                                                |
| IR1–IR8   | Source ownership, docs, public-surface, ref/BaseProps, and theming review       | singular/list prop reconciliation; retained phases; host passthrough/ref; warnings; generated docs; CSS/data attributes                                                                         | Component code bypasses shared owners, drops the host's DOM/ref contract, exposes transition state, teaches internals, or makes an unreviewed depth hook public.                                                                                      |

### Completion criteria

AST-044 may move from `accepted` to `shipped` only when:

- the ordered path, participating child ownership, one-level implicit dismissal,
  invalid-path recovery, retained presentation, final focus, and live-policy rules
  are explicitly accepted;
- the component contract and consumer docs describe the accepted API without
  treating this system spec or a prototype as usage documentation;
- every supported path edit converges under rapid controlled updates and stale
  transition or gesture completions cannot affect the newer path;
- one shared host keeps covered panels mounted, inert, and accessibility-hidden
  while only the top panel supplies dialog semantics and dismissal policy;
- modal (`hasScrim`) and non-modal behavior is correct across pointer,
  keyboard, scrolling, focus, and accessibility channels;
- invalid, duplicate, removed, and reintroduced ids follow the accepted safe
  recovery rule without blank modal presentation or mount-order selection;
- focus entry, intra-stack restoration, final return, detached targets, and
  non-modal outside focus pass the real-browser matrix;
- The switcher participates in shared Escape/platform-close ordering and does not bypass
  deeper overlays or let one request pop twice;
- SSR, hydration, reduced motion, closed-root cost, deep logical paths, and
  rapid exit/reopen pass their bounded-resource and no-stale-work checks;
- exact recede geometry and any public theming seam receive the required design,
  theming, API-admission, and visual evidence; and
- real Chromium and real Safari evidence covers the browser-owned claims before
  the Core API is released.

## Decision log

No decision below is accepted while this record has `authority: draft`.

### Proposed DEC-1 — Represent navigation as one explicit ordered path

**Reference:** `spec:AST-044/DEC-1`
**Status:** proposed; requires OQ1

Extend `BottomSheetSwitcher` with controlled `activeSheets` ordered
bottom-to-top, with stable `sheetId` values on participating children, and keep
released `activeSheet` as its length ≤ 1 projection. Keep path updates as
ordinary state operations instead of adding imperative navigation methods or
inferring chronology from booleans.

Recommended because the caller owns route state and branching, the value is
serializable, invalid hidden combinations are harder to construct, separate
roots are naturally scoped, and a sheet already opened by the switcher stacks
by appending to the same list — the motivating composition needs no second host.

Rejected: a new `BottomSheetStack` component, because it cannot compose with a
switcher-opened base sheet (that sheet belongs to neither path, so Back,
close-all, and lifetime split across two state machines); and Silk-style
implicit chronology (independent `presented` booleans + presentation-order
derivation), because mount/open chronology cannot express a restored route or
intentional branch and simultaneous presentation is unspecified.

### Proposed DEC-2 — Retain released `hasScrim` presentation; add no `modality` prop

**Reference:** `spec:AST-044/DEC-2`
**Status:** proposed; requires OQ2

Use `hasScrim` exactly as released: `true` is the modal scrim-backed host,
`false` is the non-modal host, at every path length. Add only `finalFocusRef`
as a new root policy.

Recommended because no consumer in this proposal requires modal-without-scrim
or non-modal-with-dimming, retaining the release meaning gives singular and
list consumers identical presentation with zero migration, and a split — if a
real need emerges — can be proposed family-wide with its own compatibility
classification.

Rejected: an independent `modality` prop in this change, because its derived
`hasScrim` default would contradict the claimed independence and would silently
reinterpret existing `hasScrim={false}` callers (today non-modal, under a split
modal-without-scrim). This retains the `spec:AST-002/FR16` coupling tension as
a known, deferred debt rather than fixing it opportunistically.

### Proposed DEC-3 — Treat implicit dismissal as one-level Back

**Reference:** `spec:AST-044/DEC-3`
**Status:** proposed; requires OQ3

Escape, platform close, visible modal-scrim activation, and top-sheet swipe request
the presented valid prefix without its final id when the top purpose permits that
channel. With one visible level this closes the stack. Close-all remains an
explicit caller action.

Recommended because only the front sheet owns the active interaction and a stacked
visual communicates a recoverable previous level.

Rejected: closing every level from one implicit gesture, because a two-level flow
would behave unlike its visible structure.

### Proposed DEC-4 — Preserve covered state behind one opinionated host

**Reference:** `spec:AST-044/DEC-4`
**Status:** proposed; requires OQ5

Keep covered panels mounted, inert, and accessibility-hidden under one shared
host. Give pushes and one-level pops the full enter/recede treatment; let arbitrary
controlled edits converge without promising a bespoke transition. Keep exact
motion and depth geometry internal until design and theming owners accept a stable
surface.

Recommended because a stack is one modal task whose logical depth the component
can derive.

Rejected: nested dialogs, which create competing modal/focus boundaries, and
arbitrary animation callbacks, which externalize a design-system decision.

### Proposed DEC-5 — Recover from invalid ids with the longest valid prefix

**Reference:** `spec:AST-044/DEC-5`
**Status:** proposed; requires OQ4

Stop presentation before the first unresolved, repeated, or ambiguously registered
id; warn in development; keep the controlled prop untouched; and recover if later
renders make the requested prefix valid. Never select one duplicate by mount order
or open a blank modal host.

Recommended because the prefix preserves the last unambiguous user location and
keeps validation distinct from user intent. Not calling the change callback avoids
feedback loops when callers intentionally load destinations asynchronously.

Rejected: guessing among duplicate registrations, silently reordering ids, or
closing valid ancestors because a later destination is unavailable.

## Open questions

- **OQ1 — Should `BottomSheetSwitcher` gain
  `activeSheets: ReadonlyArray<string>` plus `onActiveSheetsChange` (details
  included), keep `activeSheet`/`onActiveSheetChange` as a deprecated
  length ≤ 1 alias, and use array order as the complete bottom-to-top path with
  no imperative navigation API and no new component?**
  (`human-api`) The recommendation is Proposed DEC-1. `cixzhang` owns public API
  and cross-component consistency; `imdreamrunner` owns state, transition, and
  routing behavior.
- **OQ2 — Should the switcher retain released `hasScrim` presentation with no
  `modality` prop, adding only
  `finalFocusRef?: RefObject<HTMLElement | null>` as new root policy?**
  (`human-api`) The recommendation is Proposed DEC-2. Any future modality split
  is a separate family-wide compatibility decision.
- **OQ3 — Should Escape, platform close, a visible modal scrim, and an allowed
  swipe pop only the top sheet, with Close-all left to an explicit caller state
  update?** (`human-api`) The recommendation is Proposed DEC-3.
- **OQ4 — Should invalid or dynamic ids present the longest valid unique prefix,
  warn in development, and leave the controlled value untouched?** (`human-api`)
  The recommendation is Proposed DEC-5. The alternative must still prevent a
  blank modal host and mount-order selection.
- **OQ5 — What exact recede geometry, visible depth cap, corner treatment, and
  reduced-motion treatment should represent the stack, and does any part need a
  public theme seam?** (`human-design`) The API recommendation is to keep motion
  internal initially. `rubyycheung` and the current DESIGNOWNERS own visual
  direction; `cixzhang` owns any public theme/API admission; `imdreamrunner` owns
  transition and performance feasibility.
