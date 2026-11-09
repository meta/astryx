---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-038
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-26
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:layer-runtime]
affects_families: []
affects_contributing: []
affects_consumer_docs: [Layer, useLayer, Dialog]
---

# Layer inherited-text and grouping boundary system spec

## Intent

People opening a dialog, menu, tooltip, or other floating reading surface must
not receive centered, italic, uppercase, indented, or unwrappable body text merely
because its trigger lives in a formatted paragraph, heading, table cell, or code
region. A layer starts a new reading task while retaining the surrounding theme
and language context. Native top-layer promotion changes painting, not CSS
inheritance, so the boundary must be explicit. Nor is the layer another member
of an ancestor visual group: buttons and inputs inside it must not inherit that
group's connected borders, sizing, density, or other presentation defaults.
The trigger retains its group styling; the newly opened surface starts its
own scope. Surface/group membership stops as a whole under FR7/FR8; unrelated
contexts and explicitly authored props and accessibility semantics are preserved.

The original contract was **approved by `cixzhang` on 2026-09-23** (DEC-1–DEC-3).
On the same date, `cixzhang` corrected its scope to **text/layout/visual isolation
only** (DEC-4). Approved DEC-5 removes the requirement to separate visual fields:
surface/group membership stops as a whole under FR7/FR8. Unrelated ARIA, focus,
keyboard ownership, dismissal, semantic/data/interaction contexts, and authored
DOM/accessibility-tree semantics remain unchanged. `cixzhang` approved DEC-4 and
authorized its spec-only merge on 2026-09-23. [Implementation PR #6457](https://github.com/meta/astryx/pull/6457)
may align to this accepted contract. Neither this record nor test success
authorizes implementation merge. Architecture
projects the decision rather than independently approving it.

### Ownership

AST-038 owns the closed inherited-text baseline, the ancestor visual-group
boundary, participation rule, precedence, and compatibility decision. It is distinct from
[AST-003](../AST-003/spec.md), whose Non-goals explicitly exclude visual treatment.
AST-003 remains the owner of accepted hosting and interaction changes; this spec
neither duplicates those requirements nor makes its unimplemented changes current.

[Layer runtime](../../architecture/layer-runtime.md) describes shipped hosting
mechanisms and will project the approved text boundary when implemented. Its
existing approval cannot authorize this new cross-component styling decision.
[Component style authoring](../../architecture/component-style-authoring.md),
[theme application](../../architecture/theme-application.md), and
[public component API](../../architecture/public-component-api.md) continue to
own lowering, live theme context, and existing override seams respectively.
Current records and open work for the affected layer paths, `layerTextReset`,
`inherited text`, and `AST-038` were checked; the overlapping implementation is
PR #6457, not an independent approved contract.

## Non-goals

- Redesigning hosting, portals, positioning, modal semantics, focus, dismissal,
  selection, scrolling, motion, or which layers appear above native dialogs.
  Stopping ancestor visual styling and whole membership under FR8 is in scope;
  unrelated interaction, collection membership, disabled/selected state,
  labels/descriptions, and accessibility semantics are not changed. In particular, do not neutralize `aria-disabled`, change
  accessibility-tree disabled inheritance, add semantic roles, or introduce
  corrective portal hosting to satisfy this styling contract.
- Standardizing foregrounds, backgrounds, geometry, component type roles, or
  deliberate typography inside a layer; changing global document resets or
  non-Astryx elements; neutralizing ancestor text-decoration propagation.
- New component props, reset opt-outs, public reset utilities, theme targets,
  tokens, wrappers, or runtime style-copying. An existing explicit styling seam
  remains the way to request deliberate formatting.
- New accessibility contracts, visual harness products, or test infrastructure.
  Verification proves this styling contract; it does not authorize workflow
  additions or modifications, or changes to unrelated integration evaluators.
- Equivalent internal implementations remain valid. Private module names and
  sharing mechanisms belong in architecture or implementation, not this contract.

## Requirements

### Closed baseline

**FR1 — Neutral reading baseline.** Every participating content boundary MUST
establish exactly these inherited-property defaults before component and caller
styles. Unlisted inherited text properties are not reset by FR1.

| Property          | Baseline                   | Reason                                                        |
| ----------------- | -------------------------- | ------------------------------------------------------------- |
| `font-family`     | `var(--font-family-body)`  | Do not borrow a code or heading face.                         |
| `font-size`       | `var(--text-body-size)`    | Start ordinary content in the active theme's body role.       |
| `line-height`     | `var(--text-body-leading)` | Preserve the theme's body reading rhythm.                     |
| `font-weight`     | `var(--text-body-weight)`  | Do not borrow trigger emphasis.                               |
| `font-style`      | `normal`                   | An emphasized ancestor must not italicize the task.           |
| `text-align`      | `start`                    | Start at the reading edge, including RTL.                     |
| `text-align-last` | `auto`                     | Do not inherit last-line justification.                       |
| `text-indent`     | `0`                        | Do not inherit paragraph or icon-replacement indents.         |
| `text-transform`  | `none`                     | Preserve authored case.                                       |
| `letter-spacing`  | `normal`                   | Do not inherit heading tracking.                              |
| `word-spacing`    | `normal`                   | Do not distort reading or intrinsic size.                     |
| `text-shadow`     | `none`                     | Do not borrow decorative text shadows.                        |
| `white-space`     | `normal`                   | Permit ordinary wrapping under preformatted/nowrap ancestors. |
| `word-break`      | `normal`                   | Leave exceptional word breaking to the content owner.         |
| `overflow-wrap`   | `normal`                   | Leave long-token wrapping to the content owner.               |
| `hyphens`         | `manual`                   | Do not inherit automatic hyphenation.                         |

**FR2 — Theme and writing context survive.** The boundary MUST preserve
`direction`, `writing-mode`, `text-orientation`, language, theme/custom-property
values, `color-scheme`, font feature/variation settings, and accessibility
preferences. Scoped layout/presentation values fall under FR7 even when carried
by custom properties; this does not authorize clearing properties by prefix or
resetting semantic theme tokens. Theme is not an ancestor layout provider.
Theme body tokens MUST remain live when a local theme changes. This does not
promise more context recovery than the existing hosting contract provides.

**FR3 — Surface, behavior, and accessibility ownership survive.** Color/background pairs,
geometry, display, positioning, animation, opacity, visibility, cursor,
`pointer-events`, `touch-action`, and `user-select` MUST retain their existing
owners. ARIA attributes, focus, selection, disabled/read-only state, callbacks,
keyboard ownership, dismissal, semantic/data/interaction contexts, and DOM/AX
semantics MUST remain unchanged except for membership-owned values that stop
with their whole context under FR8. Do not otherwise change event routing or
roving focus because content is visually independent. Inverted Tooltip and Toast colors, Lightbox captions, and click-through
notification/non-modal hosts must not be changed by the text baseline. The
[container-padding boundary](../../architecture/container-padding.md) is separate.
`text-decoration` is not inherited; descendant `none` cannot remove decoration
propagated from an ancestor and is not part of FR1.

### Participation ledger

**FR4 — A reading surface, not a dismissal role.** Inclusion requires a
content-bearing Astryx surface presented outside its owner's normal flow through
Layer, native Dialog, or an equivalent layer host. Modal, non-modal, fallback, and
inline-preview presentations of the same surface MUST share the baseline.
Compositions receive it at their existing content boundary, not their trigger.
A nested layer establishes its own boundary.

| Surface family                 | Participating paths                                                                                                                                                                                                                                                                                         | Why / done criteria                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Layer-backed content           | Context/anchor, context/custom, and fixed Layer; Popover/usePopover; Tooltip/useTooltip; HoverCard/useHoverCard; ContextMenu; DropdownMenu submenus                                                                                                                                                         | The common boundary neutralizes ambient formatting in every renderer without changing geometry or hosting.               |
| Popover compositions           | DropdownMenu, MoreMenu, NavHeadingMenu, TabMenu, TopNav menus, collapsed SideNav items and heading menus, BreadcrumbItem menus; Selector/MultiSelector/ComplexSelector, Typeahead/BaseTypeahead, date inputs, PowerSearch, ChatComposerInput menus, Table filtering; Lab TourStep, ChatEmojiPicker, InfoTip | Inherit the common reset; no duplicate reset or trigger/API changes.                                                     |
| Layer utility surfaces         | Keyboard hints, Carousel controls, Tokenizer overflow, chart/radial tooltips, ListInput/TransferList drag previews                                                                                                                                                                                          | Shared host supplies the baseline; authored hint/chart nowrap and component typography still win.                        |
| Dialog family                  | Modal and inline Dialog, AlertDialog, imperative Dialog/AlertDialog, CommandPalette                                                                                                                                                                                                                         | Native and preview paths agree; component and caller styling stays stronger.                                             |
| Independent viewers/navigation | Lightbox, MobileNav including AppShell, Lab Drawer in modal and non-modal modes                                                                                                                                                                                                                             | Each independent root participates; media/caption treatment and interaction stay unchanged.                              |
| Sheets                         | Standalone and switched BottomSheet, including adaptive menu/input presentations                                                                                                                                                                                                                            | The painted content panel owns the boundary, not its transparent shell or each child.                                    |
| Notifications                  | Promoted and non-top-layer ToastViewport; LayerProvider and imperative fallback                                                                                                                                                                                                                             | The viewport supplies default/custom toast text without resetting page children or changing colors and pointer behavior. |

Consumers of Tooltip/HoverCard (including Button, Link, Text, Timestamp, Avatar,
StatusDot, and field explanations) require no independent trigger change.
Exclusions: in-flow ChatComposerDrawer, Overlay/OverlayScrim, local chart
crosshairs and zoom controls, empty Tour highlight/scrim, and portal-only Token
or Stepper mounts. The Tour Popover callout participates. Moving DOM alone does
not turn ordinary content into a reading layer.

### Precedence and compatibility

**FR5 — Explicit styling wins.** Apply the baseline on the content-bearing root
only, before component styles and supported theme/consumer overrides. Never
reset descendants. Deliberate headings, code, centered captions, bold emphasis,
nowrap hints, and Tooltip/Toast word-breaking rules MUST remain effective.
Existing `xstyle`, `className`, and `style` precedence MUST not be reordered.

**FR6 — No new choice or public surface.** There is no reset opt-out prop, public
reset helper/export, new theme target, or token. Callers that intentionally relied
on inherited formatting must express it on an existing root styling seam or on
their content (including an explicit `inherit` where supported). This is a visible
compatibility change for those callers and must be stated in consumer guidance
and release notes. Normal theme-body content must not acquire an unrelated visual
change; selected component type roles remain component-owned.

### Ancestor layout and grouping boundary

**FR7 — Ancestor layout and presentation stop at the layer boundary.** All
providers' scoped layout, visual, density, sizing, grouping, or presentation
adjustments MUST stop at the content boundary by default; a surface/group
membership context stops as a whole under FR8. This
includes general SizeProvider, not only size supplied by ButtonGroup/InputGroup,
and applies to **future providers by responsibility**, not a fixed allowlist of
names or today's evidence ledger. This direction is approved in DEC-2.

The trigger/control remains in its ancestor scope. Layer content must not gain
ancestor-group connected corner/border/separator treatment, visual orientation,
density, or sizing merely from DOM or React ancestry. The boundary applies
whether presentation is carried by context, selectors/markers, or scoped
structural custom properties. A CSS text reset alone does not satisfy it.
Theme and writing context remain covered by FR2. Semantic roles and orientation,
disabled/selected state, accessible naming, collection membership, callbacks,
and interaction behavior MUST retain their existing ownership and values,
except for whole surface/group membership that stops under FR8.

**FR8 — Whole surface/group membership; unrelated ownership survives.** Unrelated
semantic, data, interaction, and accessibility providers MUST retain their
existing inheritance and owner protocols.

Layout/visual/presentation providers intentionally targeting content inside the
layer MUST be established separately inside/across its content boundary. Those
providers govern their descendants up to the next layer boundary. Explicit child
props continue to work; theme and writing context remain preserved by FR2.
These rules apply to future providers by responsibility, not name.

When FR7 applies to surface/group membership carried by one context, that
existing whole value stops; visual fields are not separated. Membership-owned
state, including disabled/read-only state, stops with it. Unrelated contexts,
explicitly authored props, and existing public Context/Provider shapes remain
unchanged. No public opt-out or particular private mechanism is implied.

A context's field types alone do not establish that it is presentation-only.
[AvatarGroup](../../../packages/core/src/AvatarGroup/AvatarGroupContext.ts)
stores visual size/shape/overlap values, but its presence also determines
[Avatar's](../../../packages/core/src/Avatar/Avatar.tsx) tooltip `tabIndex` and
focusability. That group membership stops as a whole under FR7/FR8.
[LayoutArea](../../../packages/core/src/Layout/LayoutAreaContext.ts) selects
semantic DOM elements as well as dividers and spacing; its semantic element
selection remains unchanged.

The layer does not clear all React context or overwrite every descendant's
geometry. A grouped trigger stays visually grouped and an explicit inner visual
group works normally. Unrelated semantic ownership remains unchanged.

These examples illustrate the accepted generic distinction, not a closed list
of exceptions:

| Surface owner                                                                                                                                           | Explicit owner protocol that survives                                                                                                                                                                                                                         | Ancestor presentation that stops                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [DropdownMenu](../../../packages/core/src/DropdownMenu/DropdownMenu.tsx) and [submenu](../../../packages/core/src/DropdownMenu/DropdownMenuSubMenu.tsx) | Radio selection for that menu, its close chain, and menu-owned sizing explicitly established for its item/submenu surface. The current menu establishes its own context around the rendered content; the submenu composes its close callback with the parent. | Outer ButtonGroup visual styling and ambient SizeProvider/visual defaults. Menu-owned sizing is deliberately established by the surface owner, not a general sizing-provider exemption. |
| [Selector](../../../packages/core/src/Selector/Selector.tsx) / [Typeahead](../../../packages/core/src/Typeahead/BaseTypeahead.tsx)                      | The owner's options/results, active option, search query, and selection callbacks remain connected to its own popup. Current code carries these through local state/closures as well as component props; no new context is required by this example.          | Outer InputGroup sizing, connected borders/radii, and other group visuals do not style popup controls. The input/trigger itself remains grouped.                                        |
| [Table filter](../../../packages/core/src/Table/plugins/filtering/useTableFiltering.tsx)                                                                | Column identity, filter value/draft, and apply/clear behavior belong to the filter surface. Current code establishes a draft FilterStoreContext inside the popover and passes the column key explicitly.                                                      | Outer table/row density, dividers, alignment, and other scoped presentation do not become filter-panel defaults. The filter surface may establish its own local layout.                 |

The table filter's explicit inner store is a content-provider example. A
SizeProvider or ButtonGroup deliberately placed inside a layer likewise applies
to that content, but the same provider around its trigger does not. A nested
layer starts another boundary and requires its own explicit content provisioning.
Chart data, form models, and layer dismissal coordination retain their existing
inheritance and owner protocols; whole surface/group membership follows FR8.

### Grouping evidence and scope ledger

The audit inspected grouping providers/consumers on the proposed text-only
implementation, with source cross-checks against base
`1d940e032cab3c45d404a40f0ce8502db5b98059`. ToggleButton's newer action handling
was inspected separately and retains the same group membership path.
Read-only static-render probes used the text-only implementation at
`12991d841df03c6455ba669a026373d55c68bc45` plus its scope-removal working changes.
Static rendering proves the stated props/associations, **not browser geometry**.
No group-boundary implementation is claimed by this audit; implementation follows
the accepted rules below. The ledger records evidence, not an allowlist limiting
FR7's application to future layout or presentation providers. Observations are
historical; the proposed boundaries follow the whole-membership rule in FR8.

| Owner / evidence seam                                                                                                                                                                                                                                                                                                                                                                              | Actual mechanism and observation                                                                                                                                                                                                                                                                                                                                                                                                         | Proposed boundary / verification                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ButtonGroup](../../../packages/core/src/ButtonGroup/ButtonGroup.tsx), [Button](../../../packages/core/src/Button/Button.tsx)                                                                                                                                                                                                                                                                      | React context supplies orientation/disabled; shared SizeContext supplies size. Button applies its own sibling-sensitive radius/separator rules and suppresses standalone elevation/press treatment. Static-render probes under inline Dialog and fixed Layer produced an inner button with `disabled` and `data-size="lg"` from the outer group. No group ancestor marker or group-specific inherited CSS variable supplies these rules. | When FR7 applies, whole group membership stops with visual orientation, size, connected corners/separators, elevation treatment, and group-owned disabled state. Preserve the grouped trigger and explicit inner ButtonGroup.                                  |
| [InputGroup](../../../packages/core/src/InputGroup/InputGroup.tsx), [groupStyles](../../../packages/core/src/InputGroup/groupStyles.ts), [TextInput](../../../packages/core/src/TextInput/TextInput.tsx)                                                                                                                                                                                           | Context carries membership and label/description IDs; SizeContext carries size. Consumers apply 100% height/flex, negative border overlap, sibling corners, and skip their normal Field wrapper. Both probes gave inner TextInput `lg` and an accessible label composed from **outer and inner** labels. The context has no disabled/status boolean: do not invent a blanket state reset.                                                | When FR7 applies, outer sizing, connected-border/layout presentation, and group-owned label/description associations stop with whole membership. Preserve explicitly authored labels, Field semantics, status/disabled/read-only props, and local InputGroups. |
| [AvatarGroup context](../../../packages/core/src/AvatarGroup/AvatarGroupContext.ts), [Avatar](../../../packages/core/src/Avatar/Avatar.tsx)                                                                                                                                                                                                                                                        | Context carries size/shape/overlap; Avatar adds ring/negative overlap and changes its tooltip tab stop. Both probes produced `lg`/`square` inside the layer without local group ownership.                                                                                                                                                                                                                                               | When FR7 applies, whole group membership stops, including size/shape/ring/overlap and membership-owned tooltip focusability. Preserve explicit props and unrelated interactions; geometry still needs browser proof.                                           |
| [ToggleButtonGroup](../../../packages/core/src/ToggleButton/ToggleButtonGroup.tsx), [ToggleButton](../../../packages/core/src/ToggleButton/ToggleButton.tsx)                                                                                                                                                                                                                                       | Context carries selected values, toggle callback, size, and disabled state. Both probes produced a pressed `lg` inner toggle from the ancestor group. Source routes activation to that group's callback when `value` is present.                                                                                                                                                                                                         | When FR7 applies, whole group membership stops, including size, selected values, disabled state, and group callback ownership. Preserve explicitly authored props/callbacks and local groups.                                                                  |
| [SizeContext](../../../packages/core/src/SizeContext/SizeContext.ts)                                                                                                                                                                                                                                                                                                                               | `sizeProp ?? inherited ?? default`; providers include ButtonGroup/InputGroup and Toolbar/SideNav. The value has no provenance distinguishing an explicit general SizeProvider from a group-supplied default.                                                                                                                                                                                                                             | All ambient SizeProvider defaults stop, regardless of origin (DEC-2, OQ2 resolved). Explicit control props and providers established inside the layer continue to work there.                                                                                  |
| [Collapsible group contexts](../../../packages/core/src/Collapsible/CollapsibleGroupContext.tsx)                                                                                                                                                                                                                                                                                                   | Separate state and presentation contexts. Collapsible already clears presentation around its children; state remains deliberately separate.                                                                                                                                                                                                                                                                                              | Preserve that existing guard. Verify any bypass route before changing it; do not treat the state context as merely a divider style.                                                                                                                            |
| [ListContext](../../../packages/core/src/List/ListContext.tsx), [MetadataListContext](../../../packages/core/src/MetadataList/MetadataListContext.tsx)                                                                                                                                                                                                                                             | Source consumers inherit density/dividers/list markers and metadata orientation/label layout, respectively; no generic layer guard was found. No pixel or interaction reproduction is claimed for these paths.                                                                                                                                                                                                                           | Equivalent presentation candidates: confirm a supported independent-layer composition before adding implementation work. Existing groups inside a layer remain owners.                                                                                         |
| [RadioList](../../../packages/core/src/RadioList/RadioList.tsx), [CheckboxList](../../../packages/core/src/CheckboxList/CheckboxListContext.tsx), [SegmentedControl](../../../packages/core/src/SegmentedControl/SegmentedControlContext.ts), [TabList](../../../packages/core/src/TabList/TabListContext.ts), [menu radio group](../../../packages/core/src/DropdownMenu/DropdownMenuContext.tsx) | These contexts own collection values, callbacks, availability, roles/names, and sometimes sizing. Several child APIs require their provider and throw without it. Source reachability is not evidence that every cross-layer composition is supported or accidental.                                                                                                                                                                     | Preserve unrelated or content-local ownership, and ownership where FR7 does not apply. Under FR7, the whole ancestor surface/group membership value stops; required consumers need their complete provider established inside the layer.                       |

ButtonGroup's roving-focus boundary already excludes nested groups/popovers;
Button/InputGroup trailing-edge selectors skip `[popover]`/`template` siblings.
They protect the **outer trigger's** membership, not descendant controls inside
the popup. Keep those pre-existing fixes unchanged. Generic
[`useListFocus`](../../../packages/core/src/hooks/useListFocus.ts) item filtering
or event-ownership changes based on a new layer-content marker are outside this
visual-reset scope and MUST be reverted from the implementation. Keyboard
ownership, including existing nested-group/popover exclusions, remains unchanged.
Source searches also inspected FormLayout,
Table/Stepper, and navigation contexts/markers. Their scoped layout/presentation
responsibilities fall under FR7, whether or not named in this audit; their
semantic/data/interaction/accessibility responsibilities must remain unchanged.
SegmentedControl also uses inherited private
`--_segmented-control-radius`/`--_segmented-control-padding` values for item
corners; Tab/TabMenu consume `--_tab-indicator-bottom` from strip/container
geometry. AvatarGroupOverflow's private overlap value is authored on its own
root. These are concrete structural channels to inspect, not reasons to erase
every custom property. RadioList indicator and Tab hover/active markers style
local interaction feedback. Scoped indicator/row markers are not group context
barriers; no observed marker leak is claimed without a matching descendant and
browser-state reproduction.

### Existing normalization: consolidate only equivalents

**FR9 — Prior fixes are evidence, not a deletion list.** A normalization may move
into the shared boundary only when its value, target, cascade precedence, and
supported states are equivalent. Local type roles, wrapping, colors, geometry,
and ownership guards MUST remain component-owned when that equivalence is absent.

| Existing code                                                                                                                                          | Finding and disposition                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [useLayer](../../../packages/core/src/Layer/useLayer.tsx) base typography                                                                              | Existing body family/size/leading are the one equivalent baseline moved into the private shared reset by the text-only implementation. No token/value or precedence change for those three declarations is intended.                                                                                              |
| [Tooltip](../../../packages/core/src/Tooltip/useTooltip.tsx) painted surface                                                                           | Explicit body type, inverted colors, and content `wordBreak: break-word` are deliberate. Keep them; moving inner declarations outward can change supported overrides even where values match.                                                                                                                     |
| [Toast](../../../packages/core/src/Toast/Toast.tsx)                                                                                                    | Uses body **defaults** for size/leading, surface inversion, and content `overflowWrap: anywhere`. This is not equivalent to replacing them with inherited live body variables. Keep them.                                                                                                                         |
| [Lightbox](../../../packages/core/src/Lightbox/Lightbox.tsx), menu rows, keyboard hints, chart/radial tooltips                                         | Centered large captions, menu label/supporting type and start alignment, smaller nowrap keyboard hints, and compact chart wrapping remain intentional local presentation. Do not delete them as redundant resets.                                                                                                 |
| [useLayer portal writing context](../../../packages/core/src/Layer/useLayer.tsx), [padding reset](../../../packages/core/src/Layout/padding.stylex.ts) | Corrective portals preserve lost direction/writing mode without snapshotting tokens. The existing padding boundary resets its own structural variables. Preserve both; neither is a generic group or text barrier.                                                                                                |
| Button/InputGroup end-cap rules and Collapsible/BottomSheetSwitcher context guards                                                                     | Already solve distinct membership/ownership problems. Preserve them; the text boundary does not replace sibling classification, nested presentation isolation, or sheet registration scope.                                                                                                                       |
| `all: unset` on Item/TreeListItem/Collapsible/Stepper/Token/Thumbnail/ChatComposer controls                                                            | Local UA/control resets, not layer-root inheritance fixes. No new `all`/`unset`/`revert` layer reset is proposed. ToastViewport's `inset: unset` is geometry; menuWidth's `unset`/`revert` strings are caller-supplied width keywords routed to inline-size rather than `min()`, not a general inheritance reset. |

The audit found no existing general ButtonGroup/InputGroup context barrier in
Layer or the independent native roots. React portals preserve context, and
native top-layer painting does not break selector ancestry. The grouped-control
leaks above therefore survive the proposed text-only reset.

### Implementation requirements

- **IR1 — Bounded styling, not a sandbox.** Use supported component-local CSS
  declarations. Do not use `all`, the `font` shorthand, universal/descendant
  resets, global `[popover]`/`dialog` selectors, or copying computed ancestor styles.
- **IR2 — Minimum boundary wiring.** Share the baseline internally where package
  boundaries permit; ensure equivalent declarations at independent roots without
  creating public API solely to share styles. Do not change runtime effects,
  wrappers, portals, interaction logic, or composed callsites unnecessarily.
- **IR3 — Scope and authority stay separate.** Architecture and concise consumer
  documentation project this accepted decision; they do not repeat an independent
  policy. Acceptance does not claim shipped behavior or authorize a merge.
  Verification must not be used to broaden implementation scope.
- **IR4 — Inclusive responsibility, bounded implementation.** Provider isolation
  must be private, ownership-aware, and consistent across FR4 content roots.
  Apply FR7 by responsibility, including future scoped layout/visual providers,
  not a fixed reset allowlist copied from this audit. Do not wipe unrelated
  contexts or custom properties. When FR7 applies, whole surface/group membership
  stops under FR8 without separating visual fields. No DOM wrapper, public boundary
  API, semantic role, ARIA neutralization, portal, or general CSS reset is implied;
  verification must cover visual isolation and unchanged unrelated behavior/accessibility.

### Platform support

- Supported feature/engine floor: the existing
  [browser support policy](../../../packages/cli/assets/docs/browser-support.doc.mjs)
  applies; this spec raises no engine floor. Native hosting still follows its
  own support contract.
- Unsupported behavior: the existing display fallback must retain the same text
  baseline. It is not upgraded to native top-layer, positioning, or dismissal
  equivalence by this change.
- Browser evidence: actual CSS inheritance, theme cascade, wrapping, and pixels
  require real Chromium; emitted declarations in a DOM unit environment are not
  sufficient visual proof. No Safari-specific claim is made from Chromium output.

## Current-state impact

After implementation, `architecture:layer-runtime` will project the
baseline ownership and link this spec. Layer, useLayer, and Dialog consumer
guidance will explain intentional formatting at the root/content, and the
changeset will describe the compatibility impact. No family membership,
contributor policy, theme-application semantics, or AST-003 claim changes.

## Verification

| Contract     | Verification                                                                                               | Representative states                                                                                                                           | Mutation or failure expectation                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR4     | Existing real-browser visual regression and computed-style evidence over all supported layer content roots | Both Layer renderers, Dialog native/inline, independent native roots, sheets standalone/switched, Toast promoted/hosted, Drawer modal/non-modal | Removing a boundary's baseline restores inherited formatting in the browser comparison.                                                                                      |
| FR2, FR5     | Unit override controls plus real-browser cascade evidence                                                  | Nested/light/dark themes, LTR/RTL and vertical writing, live body tokens; authored child emphasis/code and direct root overrides                | A broad reset, descendant rule, frozen tokens, or reversed precedence fails the preserved-context/style control.                                                             |
| FR1, FR6     | Real-browser before/after pixels retained with the implementation PR                                       | Normal theme-body DOM and a deliberately hostile centered/italic/uppercase/indented/spaced/shadowed/preformatted ancestor; parent and submenu   | Restoring inherited alignment produces visibly centered hostile text; normal baseline remains unchanged. Label a mutation as a regression control, not as historical source. |
| FR3, FR4     | Existing component behavior tests and browser inspection                                                   | Positioning, focus/dismissal, caption and inverted colors, click-through viewport/non-modal host                                                | Removed or reordered component styles fail existing controls; no broader interaction contract is inferred.                                                                   |
| FR6, IR1–IR3 | Diff review, existing lint/type/build/knowledge checks                                                     | Export map and barrels, reset declarations, architecture projection, changeset                                                                  | New public reset API, broad selectors, workflow changes, or an approval claim without owner approval fails review.                                                           |

Use existing visual regression for presentation and established component tests
for FR7/FR8 behavior.
Check visual size, density, connected corners/separators, overlap, and layout
under hostile outer groups and SizeProvider defaults. Include native/inline
Dialog, existing inline/correctively-portaled context Layer paths, fixed Layer,
and independent roots without adding hosting paths. Keep the outer trigger
visually grouped and explicit inner visual/layout providers working. Verify a
future-style scoped presentation provider by responsibility, not only today's
names; nested layers stop ambient presentation again.

Behavior and accessibility checks preserve unrelated behavior and explicit props,
except for membership-owned values that stop under FR8. Compare ARIA,
labels/descriptions, focus/tab stops, keyboard
ownership, disabled/read-only and selected/pressed state, callback identities
and results, dismissal, and DOM/AX semantics with the existing behavior. Keep
unrelated semantic/data/interaction contexts live and unchanged. Preserve
LayoutArea's semantic DOM elements and `useListFocus`'s existing item/event ownership.
Preserve menu radio selection/close, Selector/Typeahead active
option/search/selection, and Table filter draft/apply behavior. Verify that
membership-owned state stops with its context while explicitly authored disabled
or selected props remain effective; no new accessibility-tree boundary is required.

Real-browser checks establish presentation and preserved behavior; static
rendering cannot prove pixels. Removing a visual isolation barrier must restore
the matching visual leak. Changing unrelated semantic fields, ARIA, keyboard routing,
hosting, or callbacks must fail preservation controls. FR9 retains local
text/wrapping and existing group-tail/keyboard guards unchanged.

Browser
screenshots and their provenance belong in PR evidence; this styling decision
does not require a dedicated accessibility spec, committed story matrix, or new
workflow/artifact wiring. Test success is evidence, not owner approval.

## Decision log

### DEC-1 — Accepted neutral reading boundary

**Reference:** `spec:AST-038/DEC-1`
**Decider:** `cixzhang`, `2026-09-23`

Approved the closed FR1 baseline at FR4 boundaries, with FR2/FR3 preservation,
FR5 precedence, and FR6's compatibility/no-new-API contract. This makes the same
reading task independent of incidental trigger formatting without erasing its
theme or intentional content styling.

Rejected: Dialog-only treatment (other layers still inherit); resetting all CSS
(destroys unrelated style/context); resetting document-wide dialog/popover
selectors (changes non-Astryx UI); preserving all ambient typography (retains the
reported failure); an opt-out prop or public reset utility (adds a permanent
caller choice where existing styling seams suffice).

### DEC-2 — Accepted inclusive layout-provider boundary

**Reference:** `spec:AST-038/DEC-2`
**Decider:** `cixzhang`, `2026-09-23`

Approved FR7: all surface-level layout, visual, density, sizing, grouping, and
presentation providers stop at the layer content boundary by default, including
general SizeProvider and future providers with those responsibilities. This is
not a fixed allowlist. The trigger stays in its surrounding group; independent
layer content does not implicitly join its visual styling. DEC-4 clarifies that
semantic membership and behavior remain unchanged. Theme and writing context survive.
OQ2 is resolved: no distinction between group-origin and general ambient size
permits either to leak across the boundary.

Rejected: text CSS alone (does not stop context membership); portals alone
(preserve React context and change hosting); limiting isolation to today's named
groups (future presentation providers would leak); resetting every descendant's
borders/radii (destroys valid content-owned groups).

### DEC-3 — Accepted explicit surface/content protocol

**Reference:** `spec:AST-038/DEC-3`
**Decider:** `cixzhang`, `2026-09-23`

**Historical record, narrowed by DEC-4:** The original FR8 wording required
explicit owner protocols for semantic/data/interaction providers and separately
provided layout/visual content contexts. It also applied that rule to mixed
providers. That wording conflated presentation and semantic membership.
DEC-4 removes the semantic-state reset requirement; it preserves existing
semantic inheritance and narrows explicit content provision to visual/layout
ownership. FR9's preservation of non-equivalent local styling still applies.

### DEC-4 — Visual reset only; behavior and accessibility unchanged

**Reference:** `spec:AST-038/DEC-4`
**Decider:** `cixzhang`, `2026-09-23`
**Status:** Approved by `cixzhang` on 2026-09-23, with authorization to merge
this spec correction only. That approval covered DEC-1–DEC-4; the historical
mixed-provider rule below is amended by approved DEC-5.

Corrected the scope: **VISUAL RESET ONLY**. Preserve ARIA, focus, selection,
disabled/read-only state, callbacks, keyboard ownership, dismissal,
semantic/data/interaction contexts, and DOM/AX semantics exactly. The visual
boundary isolates text, size, density, visual grouping, borders/radii/separators,
and scoped layout properties only. Its requirement to separate visual ownership
from mixed providers is superseded by approved DEC-5.

This supersedes any semantic-reset interpretation of DEC-2/DEC-3 and the earlier
FR7/FR8 evidence ledger. `aria-disabled` neutralization, new AX-disabled isolation
assertions, semantic group roles, and corrective portal hosting are excluded.
Verification proves visual isolation plus unchanged behavior/accessibility;
it must not invent a new a11y contract. The FR1 theme-body metrics remain
unchanged; this is not a revival of the rejected neutral-document-metric proposal.

Rejected: clearing a mixed context wholesale and rebuilding selected semantics
at popup callsites; changing disabled/selected state to demonstrate isolation;
adding roles/ARIA/portals to make a styling boundary an accessibility boundary;
changing focus or keyboard ownership because a surface is visually independent.

### DEC-5 — Remove the visual-context separation requirement

**Reference:** `spec:AST-038/DEC-5`
**Decider:** `cixzhang`, `2026-09-24`
**Status:** Approved by `cixzhang` on 2026-09-26.

When FR7 applies to surface/group membership carried by one context, that
existing whole value stops; visual fields are not separated. Membership-owned
state, including disabled/read-only state, stops with it.
Unrelated contexts and explicitly authored props remain unchanged.
This supersedes conflicting separation and membership-preservation
clauses in DEC-1–DEC-4; all other scope and the FR1 baseline remain unchanged.

## Open questions

None. OQ1–OQ3 remain historical decisions. Approved DEC-5 amends the requirement
to separate visual context; neither spec approval nor validation authorizes
implementation merge.
