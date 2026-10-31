---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-089
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [cixzhang, imdreamrunner]
affects_architecture: [architecture:public-component-api]
affects_families: [family:layout-primitives, family:input-fields]
affects_contributing: [contributing:api-conventions]
affects_consumer_docs: [principles]
---

# Outermost DOM styling target

## Intent

A consumer uses `style`, `className`, and `xstyle` to style a component as one
unit without learning its internal anatomy. Every accepted general styling
prop has one predictable DOM target.

The shared target is the outermost component-owned DOM element. Named part
styling and explicitly recorded compatibility exemptions retain their own targets.

## Non-goals

- Require every component to accept general styling props or add a DOM wrapper.
- Apply a general styling prop to every descendant or detached surface.
- Change styling precedence, semantic props, events, accessibility, or ref targets.
- Replace named part styling or the input family's prohibition on root styling.
- Specify enforcement algorithms, registries, or CI topology.

## Requirements

- **FR1 — One outermost target.** A stable Core web component that accepts any of
  `style`, `className`, or `xstyle` MUST apply every accepted general styling prop
  to the same outermost component-owned DOM element on every supported render
  path that renders owned DOM, except for the explicit compatibility exemptions below.
- **FR2 — Outermost includes owned plumbing.** The target has no component-owned
  DOM ancestor in its rendered tree. Whenever any owned DOM renders, there MUST
  be exactly one owned root across the component's trees; a sole portal root
  qualifies, but a hidden measurement peer or an in-tree root plus a detached
  surface does not. Consumer-supplied children and external portal hosts do not
  themselves count as owned roots. Rendered implementation and composed wrappers
  do count. When no owned DOM renders, general styling has no effect and does not
  move to another element. An empty path does not establish a target guarantee
  for an otherwise headless component. An exemption names the particular paths
  that cannot meet this definition.
- **FR3 — No unique target, no new general styling API.** A component without one
  guaranteed outermost DOM target whenever owned DOM renders MUST NOT introduce
  general styling props. It MAY expose separately named styling inputs for its
  parts instead. An existing accepted prop is not removed or retargeted solely
  to meet this rule; its exemption and compatibility obligations govern that transition.
- **FR4 — Composition preserves the target contract.** Forwarding to a composed
  component is valid only when its public contract guarantees the same outermost
  DOM target on every supported path. A native polymorphic tag qualifies; an
  unrestricted consumer component does not establish a DOM guarantee merely by
  accepting the props. Existing unrestricted composition requires a scoped
  exemption, not an invented guarantee.
- **FR5 — Styling and semantics are separate.** `ref`, the element type in
  `BaseProps<T>`, ids, data attributes, ARIA, roles, tab stops, and DOM events
  retain the targets promised by their owning contracts. Those targets MAY be
  inner elements. Consumer documentation MUST distinguish them from the general
  styling target. An internal or public ref does not select the styling target.
- **FR6 — Named parts and family exclusions remain intact.** Part styling uses the
  complete `<part>Xstyle`, `<part>ClassName`, and `<part>Style` set under
  `spec:AST-071`. `family:input-fields` FR10 and DEC-7 continue to forbid root
  styling on Field-composed components and define their `container*` and
  `control*` targets. This rule neither restores those root props nor reroutes
  named parts to the outermost element.
- **FR7 — Exemptions preserve a bounded contract.** Each exemption identifies the
  component, affected render path, retained styling target, reason, and owning
  contract. It exempts only the stated divergence from this default; it does not
  approve an existing violation of another current owner. Explicitly listed split
  or missing general-styling targets are legacy enforcement exemptions, not valid
  replacement contracts: their current preservation/composition obligations remain
  open. Unrelated ref failures, dropped neutral props, named-part defects, and
  styling-composition defects outside the listed target scope are not exempt.
  New components and new divergence paths MUST NOT inherit an exemption by analogy. Removing or expanding an exemption requires an explicit
  owner decision; there is no automatic expiry or forced migration.
- **FR8 — Compatibility and authority remain explicit.** Moving a released styling
  or ref target, combining split targets, or removing an accepted prop follows
  `spec:AST-017`, with the required compatibility decision, migration evidence,
  consumer documentation, and release classification. Making this record current
  also updates conflicting current API, family, and component claims together.
  No exemption waives a migration already required by another current owner.

### Platform support

- Scope: stable Core web components and the composed render paths that implement
  them. Hooks are not independently governed; a component implemented with a hook
  still follows the component contract.
- Non-DOM renderers, providers without a DOM styling surface, and Lab components
  are outside this rule. A component that accepts no general styling props owes
  no default styling target.
- Browser feature support is unchanged. Element-identity tests prove targeting;
  real-browser evidence is needed for a future migration's observable layout,
  appearance, or interaction claims, not for this record's text alone.

## Current-state impact

The canonical shared API owner is `architecture:public-component-api`, whose
INV5 and INV6 preserve styling on the documented contract element and composition,
and whose INV8 preserves the documented ref target. That per-component target is
not necessarily the outermost element. These current claims remain authoritative
while this record is draft.

The outermost default applies only to supported general styling inputs without
an explicit exemption. Existing component-specific surface targets, named parts,
and family exclusions remain documented rather than silently reclassified.

The input family's [part-target contract](../../families/input-fields.md#cross-component-invariants)
owns `container*` and `control*` semantics. An exemption here does not waive any
remaining implementation debt under `family:input-fields` FR10 and DEC-7.

### Compatibility exemptions

These exemptions apply only to the named existing API and render paths. They
retain the target stated below, not an arbitrary descendant or every future
path of that component. All accepted general styling inputs continue to compose
on that target unless a separately listed legacy gap remains. An auxiliary
surface is an additional root only when its actual DOM lies outside the styled
root; being hidden, fixed, or in the native top layer alone does not detach it.
Shared document-lifetime announcement nodes and stylesheets are not per-instance
component roots.

#### Target-preservation exemptions

| ID  | Component and path                                                                                                                                                                                                                                                                                                                                                                               | Retained styling target                                                                                                                                                                                                                                                  | Reason / owning contract                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | List with a header                                                                                                                                                                                                                                                                                                                                                                               | Semantic `ul` or `ol`                                                                                                                                                                                                                                                    | The header wrapper surrounds the list; `component:List` owns the list target.                                                                                                                                                                                                                                                                                                      |
| E2  | FieldLabel with a description, or with an auxiliary tooltip outside its label root                                                                                                                                                                                                                                                                                                               | Single-control `label` or group-label `span`, never the description wrapper                                                                                                                                                                                              | Preserve label-only styling; shared API owner and the input-family label contract. Ref-type debt is separate.                                                                                                                                                                                                                                                                      |
| E3  | Table with its default or consumer-supplied enclosing scroll wrapper                                                                                                                                                                                                                                                                                                                             | The `table`                                                                                                                                                                                                                                                              | The scroll wrapper is outside the semantic table; `component:Table` owns that seam.                                                                                                                                                                                                                                                                                                |
| E4  | CodeBlock with SyntaxTheme, or an owned copy tooltip hosted outside `pre`                                                                                                                                                                                                                                                                                                                        | The `pre`                                                                                                                                                                                                                                                                | Preserve semantic code styling rather than the SyntaxTheme wrapper or tooltip host; `component:CodeBlock`.                                                                                                                                                                                                                                                                         |
| E5  | BottomSheet standalone and BottomSheetSwitcher child-panel paths                                                                                                                                                                                                                                                                                                                                 | The visual panel `div`, not dialog or positioner                                                                                                                                                                                                                         | The panel has an owned ancestor; `component:BottomSheet` owns the panel target. The public ref remains that DOM panel, not an object handle.                                                                                                                                                                                                                                       |
| E6  | Expanded resizable SideNav                                                                                                                                                                                                                                                                                                                                                                       | The `nav` inside the resize wrapper                                                                                                                                                                                                                                      | Preserve navigation styling rather than the resize container; `component:SideNav`.                                                                                                                                                                                                                                                                                                 |
| E7  | TopNavMenu and TopNavMegaMenu drawer-header paths                                                                                                                                                                                                                                                                                                                                                | The header `button` inside the section                                                                                                                                                                                                                                   | Preserve the existing control target; shared API and navigation component owners. Unbound drawer refs remain debt.                                                                                                                                                                                                                                                                 |
| E8  | Inline MetadataListItem                                                                                                                                                                                                                                                                                                                                                                          | The `dt`, not its peer `dd`                                                                                                                                                                                                                                              | The semantic pair has no single root; shared API owner. Wrong declared ref type is not approved by this exemption.                                                                                                                                                                                                                                                                 |
| E9  | ChatMessageBubble with a rendered name or metadata peer                                                                                                                                                                                                                                                                                                                                          | The central bubble `div`                                                                                                                                                                                                                                                 | Peer wrappers are not styled by the bubble inputs; shared API and Chat component owners.                                                                                                                                                                                                                                                                                           |
| E10 | Active compact Step with a summary outside its `li`                                                                                                                                                                                                                                                                                                                                              | The Step `li`                                                                                                                                                                                                                                                            | The summary lives in the Stepper slot, outside Step; shared API and Stepper component owners.                                                                                                                                                                                                                                                                                      |
| E11 | OverflowList, including an empty item list                                                                                                                                                                                                                                                                                                                                                       | The visible list-container `div`                                                                                                                                                                                                                                         | The inert measurement `div` is always a peer; shared API and OverflowList owners.                                                                                                                                                                                                                                                                                                  |
| E12 | Avatar with a nonblank tooltip; Button, IconButton, and ToggleButton with a truthy tooltip; truncated Text and Heading with a tooltip; TabMenu; SegmentedControl with a disabled-reason peer or escaping keyboard hint                                                                                                                                                                           | The existing avatar/control/text/heading/group element                                                                                                                                                                                                                   | Persistent template and tooltip/popup DOM can be peers; shared API and the respective component owners. Native versus custom root behavior remains distinct.                                                                                                                                                                                                                       |
| E13 | Link with explicit Tooltip or an escaping truncation tooltip; Thumbnail with a label; StatusDot with a tooltip                                                                                                                                                                                                                                                                                   | Link's interactive element, the thumbnail `div`, or the dot `span`                                                                                                                                                                                                       | The Tooltip wrapper or surface is not the styled element; shared API and the respective component owners.                                                                                                                                                                                                                                                                          |
| E14 | Loaded Timestamp hover card                                                                                                                                                                                                                                                                                                                                                                      | The outer Text `span`, not `time` or card                                                                                                                                                                                                                                | The hover wrapper, marker, and card introduce owned peers; shared API and temporal component owners.                                                                                                                                                                                                                                                                               |
| E15 | TopNavHeading and SideNavHeading menu paths; SideNavHeading collapsed tooltip paths; TopNavMenu and TopNavMegaMenu desktop; resolved flyout or detached drill-view DropdownMenuSubMenu, ContextMenuSubMenu, and BreadcrumbMenuSubMenu                                                                                                                                                            | The heading/link/button or submenu trigger row                                                                                                                                                                                                                           | Existing menu-trigger styling does not style sibling layer/active-view DOM; shared API and navigation/menu owners. Unresolved or off-stack row-only paths are not multi-root exemptions.                                                                                                                                                                                           |
| E16 | BaseTypeahead, including pre-host and closed states                                                                                                                                                                                                                                                                                                                                              | The native combobox `input`                                                                                                                                                                                                                                              | Persistent template peer, optional direct-busy span, and popup host prevent a single root; shared API and input-engine owners.                                                                                                                                                                                                                                                     |
| E17 | InputClearButton's generic-tooltip path                                                                                                                                                                                                                                                                                                                                                          | The native clear `button`; only accepted `xstyle` is covered                                                                                                                                                                                                             | No single root encompasses its tooltip peers; shared API owner. Required missing class/style counterparts and incomplete icon-part inputs remain separate AST-071 obligations.                                                                                                                                                                                                     |
| E18 | Banner; Carousel with controls; Field with a label tooltip; CheckboxInput; Switch; ChatComposerInput; Markdown; TabList; Toolbar; Pagination; ProgressBar; Stepper; DialogHeader; DrawerHeader; Breadcrumbs; BreadcrumbItem; NavHeadingMenuItem; TableCell; TableHeaderCell; TableSelectionToolbar — only when an owned auxiliary surface is actually hosted beyond their respective styled root | The component's existing local styling root: frame, field, editor/Document, navigation/header, item, or table-cell/toolbar element                                                                                                                                       | `architecture:layer-runtime` and the respective component owners retain local styling. Breadcrumbs requires escape beyond `nav`; BreadcrumbItem requires escape beyond `li`. Contained corrective hosts, native top-layer promotion, and caller-owned portals do not qualify.                                                                                                      |
| E19 | ContextMenu and MoreMenu pointer/sheet paths; DropdownMenu pointer/sheet; Popover automatic/custom/external-anchor paths; HoverCard text/element/fragment-trigger paths                                                                                                                                                                                                                          | ContextMenu/MoreMenu/DropdownMenu's inner menu/content `div`; Popover's inner painted `div`; HoverCard's floating `div`                                                                                                                                                  | Trigger, template, positioned host, and sheet DOM do not define one styling root. `component:Popover` owns its painted surface; menu/HoverCard owners and the shared API own the other seams. Named or payload refs do not change these targets.                                                                                                                                   |
| E20 | PowerSearch when the nested Tokenizer Field box renders                                                                                                                                                                                                                                                                                                                                          | The nested Field box through Tokenizer's `container*` set                                                                                                                                                                                                                | Higher-level composition retains its current field-box styling rather than the PowerSearch wrapper/editor. Where the part has no box it has no effect and warns, never reroutes. `component:PowerSearch`, `component:Tokenizer`, and the input-family part contract.                                                                                                               |
| E21 | Existing unrestricted custom-root APIs: Stack, HStack, VStack, StackItem, Item; the custom link/router branches of Avatar, Button, IconButton, Link, Tab, Token, DropdownMenuItem/ContextMenuItem/BreadcrumbMenuItem, NavHeadingMenuItem, TopNavHeading, TopNavItem, TopNavMegaMenuItem, SideNavHeading, and SideNavItem; custom Icon root handoff and Table wrapper/transform handoff           | The existing lowered class/inline-style and ref handoff to the caller component, not a newly selected DOM node; for Table, styling and the public ref remain on the received semantic table, which wrapper/context output may retain, wrap, duplicate, detach, or remove | Exemption from the new composed-root proof requirement only. Preserve the released custom-renderer API without asserting that arbitrary caller output has a single root or forwards props. Native/built-in branches still owe their own target contract; new APIs and divergence paths are not covered. `family:layout-primitives`, the shared API, and each root/transform owner. |
| E22 | InputGroup ordinary and horizontal-label paths — target-only, subject to unresolved family scope                                                                                                                                                                                                                                                                                                 | The inner `div[role=group]`                                                                                                                                                                                                                                              | It is inside Field rather than outermost. This exemption does not allow root styling if FR10 forbids it; the family/direct owners resolve OQ2 before promotion.                                                                                                                                                                                                                    |

#### Legacy default-enforcement exemptions

These are explicit exclusions from the new uniform-target check, not valid
replacement contracts. Existing current-owner obligations remain open.

| ID  | Component and path                                                          | Existing accepted-styling gap                                                                               | Obligations retained                                                                                                                 |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| L1  | ChatComposer rendered frame/body paths                                      | `style` and `className` reach the frame; `xstyle` reaches the body                                          | Shared API INV5/INV6; no approved split target is inferred from a draft.                                                             |
| L2  | SideNavItem rendered paths                                                  | `xstyle` reaches the outer column; `className` and `style` reach the inner primary control                  | Shared API INV5/INV6; public ref and other pass-through defects remain independently open.                                           |
| L3  | TopNav content-bearing drawer paths                                         | All accepted general styling inputs are dropped                                                             | Shared API INV5/INV6/INV8; truly empty output is not an exemption by itself.                                                         |
| L4  | SideNav content-bearing drawer-content paths                                | All accepted general styling inputs are dropped                                                             | Shared API INV5/INV6/INV8; a conditional footer root does not repair the loss.                                                       |
| L5  | TypeaheadItem's nonempty caller `item.element` path                         | Accepted general styling inputs are not applied to the returned caller node                                 | Shared API INV5/INV6/INV8; arbitrary caller output is not an owned root or a guaranteed forwarder.                                   |
| L6  | SegmentedControlItem                                                        | Accepted `className` is overwritten; dynamic StyleX output can overwrite the entire accepted inline `style` | Shared API INV5/INV6; this is lost styling, not a permissible split or precedence decision.                                          |
| L7  | VisuallyHidden's accepted inherited `xstyle`, on intrinsic and custom paths | `xstyle` is leaked/uninterpreted rather than applied; `className` and `style` are not accepted              | Shared API/AST-071 obligations and the styling-free intention require reconciliation; the exemption does not create styling support. |

Hook renderer styling channels are outside this component-default rule. Their
own current contracts continue to govern, including any accepted renderer-prop
gaps. The absence of general styling on Tooltip, Toast, ToastViewport, Theme,
MediaTheme, SyntaxTheme, and providers is not a grandfather exemption or a
promise that they have no owned DOM.

### Owner projections

The shared target and exemption boundary belong in
`architecture:public-component-api` and `contributing:api-conventions`.
`family:layout-primitives` owns its polymorphic member contracts;
`family:input-fields` owns its root-styling exclusion and part targets. Each
exempted component's owning contract and consumer docs state the retained target
and applicable paths. Current records are not rewritten by this draft.

## Verification

| Contract | Verification                                                                                               | Representative states                                                                                                       | Mutation or failure expectation                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| FR1–FR2  | Distinct inline-style, class-name, and StyleX markers on rendered DOM, plus owned-root identity assertions | direct root, composed root, sole portal, conditional wrapper, hidden peer, detached surface; fully empty render, then mount | A marker reaches an inner, peer, or different element on a non-exempt path.                          |
| FR3–FR4  | Public-prop/type inspection and element-identity fixtures for supported composition                        | intrinsic `as`, guaranteed composed target, unrestricted `as`, no owned root                                                | An unguaranteed component gains general styling inputs or passes solely because it forwards props.   |
| FR5–FR6  | Owning contracts, public types, ref/semantic pass-through tests, and named-part markers                    | distinct styling/ref targets; standalone, grouped, and horizontal-label fields                                              | Styling retargets a semantic ref or a part; a Field-composed component gains forbidden root styling. |
| FR7      | Explicit component/path/target exemption coverage and negative cases outside each exemption                | every retained target and relevant mode; new sibling and new render path                                                    | A blanket waiver hides a dropped prop or covers an unlisted divergence.                              |
| FR8      | Current-record consistency, consumer migration evidence, compatibility review, and release metadata        | exemption retention, target move, prop removal                                                                              | A target changes silently or a draft is treated as authority.                                        |

## Decision log

### DEC-1 — General styling targets the outermost element

**Reference:** `spec:AST-089/DEC-1`
**Proposed decider:** `imdreamrunner`

A predictable whole-component styling target lets consumers place and adapt the
component without inspecting its wrappers. All accepted general styling props
reach the same outermost owned element; explicit exemptions keep established
component targets without making arbitrary target choice the default.

Rejected: silently choosing an inner target for each component, because equivalent props would require implementation knowledge.

### DEC-2 — Existing divergences are explicit compatibility exemptions

**Reference:** `spec:AST-089/DEC-2`
**Proposed decider:** `imdreamrunner`

The default does not force a breaking root wrapper, target move, or prop removal.
An exemption preserves only the named existing target and path. Named family
exclusions and their separately approved migrations retain their own authority.

Rejected: treating every existing divergence as an immediate migration prerequisite, because the default would force unrelated consumer changes.

## Open questions

- **OQ1 — Should the shared default target DOM ancestry or the public DOM ref?**
  (`human-api`) The outermost default styles the whole owned root; the ref-first
  default styles the documented public DOM ref target and uses the unique
  outermost root only when no unprefixed ref is exposed. Either retains explicit
  existing exemptions. The shared API owners select one rule before promotion.
- **OQ2 — Does the Field-composed root-styling prohibition include InputGroup?**
  (`human-api`) InputGroup exposes general styling on its inner group while
  composing Field, but the current family distinguishes it as a collaborator.
  The family and direct API owners reconcile that scope; E22 does not waive FR10.
