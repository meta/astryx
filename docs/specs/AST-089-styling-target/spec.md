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

# Ref-first DOM styling target

## Intent

A consumer uses `style`, `className`, and `xstyle` on the same element they can
reach through the component's public DOM ref. When the component exposes no
unprefixed ref, those props style its unique outermost DOM element.

Named part styling and explicitly recorded compatibility exemptions retain their
own targets. Ref identity, not the presence of a caller-supplied ref value,
defines the default styling target.

## Non-goals

- Require every component to accept general styling props or expose a DOM ref.
- Add, move, or select among public ref targets to change styling behavior.
- Change styling precedence, semantic props, events, accessibility, or ref behavior.
- Replace named part styling or the input family's prohibition on root styling.
- Specify enforcement algorithms, registries, or CI topology.

## Requirements

- **FR1 — Public DOM ref first.** A stable Core web component that accepts any of
  `style`, `className`, or `xstyle` and exposes an unprefixed DOM `ref` MUST apply
  every accepted general styling prop to the element promised by that ref's
  public contract on every supported render path, except for the explicit
  compatibility exemptions below. The target MAY be an inner control or a sole
  detached surface; DOM ancestry does not override a valid public ref target.
- **FR2 — The API selects the target, not the callsite.** FR1 applies whether the
  caller passes `ref`, omits it, uses a callback or object ref, or passes `null`.
  A transient `ref.current === null`, a closed surface, or an unmounted target
  MUST NOT cause styling to move to another element. When the promised target is
  absent, there is no element to style until it renders. Internal refs and named
  refs such as `contentRef`, `triggerRef`, or `controlRef` do not select the
  default; they retain their separately named part contracts.
- **FR3 — No exposed ref means outermost fallback.** Only a component whose public
  API exposes no unprefixed ref uses the unique outermost component-owned DOM
  element. It has no component-owned DOM ancestor, and whenever any owned DOM
  renders, there MUST be exactly one owned root across the component's trees.
  A sole portal root qualifies; hidden measurement peers, composed wrappers,
  and detached public surfaces count as owned DOM. Consumer-supplied children
  and external portal hosts do not themselves count as owned roots. When no
  owned DOM renders, general styling has no effect and does not move to another
  element. An empty path does not establish a target guarantee for an otherwise
  headless component. The fallback does not depend on runtime ref presence or value.
- **FR4 — An unusable ref is not an absent ref.** An unprefixed `ref` that resolves
  to an imperative handle rather than directly to a DOM element, an ambiguous
  public ref contract, or an exposed ref that is not forwarded supplies no
  default styleable element. A DOM-valued member of an imperative handle does
  not make the handle a DOM ref. Such a component MUST NOT introduce general
  styling props until it has a valid target contract. It MAY expose explicitly
  named part styling instead. It MUST NOT silently use the outermost fallback
  merely because FR1 cannot be satisfied. Existing behavior requires a scoped
  exemption; ordinary ref-forwarding defects remain defects under their current owners.
- **FR5 — Composition preserves public identity.** A composed or polymorphic
  component MUST guarantee that every accepted general styling input reaches its
  promised public DOM ref element, or its unique outermost root when it exposes
  no ref. Merely forwarding the props to an unrestricted consumer component does
  not prove this guarantee. Adding, removing, retyping, or retargeting an exposed
  ref MUST NOT silently change the styling target.
- **FR6 — Named parts and family exclusions remain intact.** Part styling uses the
  complete `<part>Xstyle`, `<part>ClassName`, and `<part>Style` set under
  `spec:AST-071`. `family:input-fields` FR10 and DEC-7 continue to forbid root
  styling on Field-composed components and define their `container*` and
  `control*` targets. Having a native input ref does not restore forbidden root
  styling, and having a named `controlRef` does not reroute general or named
  styling. Semantic props retain their owning contracts' targets.
- **FR7 — Exemptions preserve a bounded contract.** Each exemption identifies the
  component, affected render path, retained styling target, actual ref contract
  or missing guarantee, reason, and owning contract. It exempts only the stated
  divergence from this default; it does not approve an existing violation of
  another current owner. Explicitly listed split or missing general-styling
  targets are legacy enforcement exemptions, not valid replacement contracts:
  their current preservation/composition obligations remain open. Unrelated ref
  failures, dropped neutral props, named-part defects, and styling-composition
  defects outside the listed target scope are not exempt. New components and new
  divergence paths MUST NOT inherit an exemption by analogy. Removing or
  expanding an exemption requires an explicit owner decision; there is no
  automatic expiry or forced migration.
- **FR8 — Compatibility and authority remain explicit.** A ref API change is also
  a styling compatibility review when it would change the default target. Moving
  a released styling or ref target, combining split targets, or removing an
  accepted prop follows `spec:AST-017`, with the required compatibility decision,
  migration evidence, consumer documentation, and release classification. Making
  this record current also updates conflicting current API, family, and component
  claims together. No exemption waives a migration already required by another
  current owner.

### Platform support

- Scope: stable Core web components and the composed render paths that implement
  them. Hooks are not independently governed; a component implemented with a hook
  still follows the component contract.
- Non-DOM renderers, providers without a DOM styling surface, and Lab components
  are outside this rule. A component that accepts no general styling props owes
  no default styling target.
- Browser feature support is unchanged. Element/ref-identity tests prove
  targeting; real-browser evidence is needed for a future migration's observable
  layout, appearance, or interaction claims, not for this record's text alone.

## Current-state impact

The canonical shared API owner is `architecture:public-component-api`, whose
INV5 and INV6 preserve styling on the documented contract element and composition,
and whose INV8 preserves the documented ref target. They do not require styling
and ref targets to be the same element. These current claims remain authoritative
while this record is draft.

The ref-first default applies only to supported general styling inputs without
an explicit exemption. Existing component-specific surface targets, named parts,
and family exclusions remain documented rather than silently reclassified.

The input family's [part-target contract](../../families/input-fields.md#cross-component-invariants)
owns `container*` and `control*` semantics. An exemption here does not waive any
remaining implementation debt under `family:input-fields` FR10 and DEC-7.

### Compatibility exemptions

These exemptions apply only to the named existing API and render paths. They
retain the styling and ref targets stated below; supplying, omitting, detaching,
or clearing a ref does not select another target. All accepted general styling
inputs continue to compose on the retained element unless a separately listed
legacy gap remains. A topology difference alone needs no exemption when the
styling set already reaches a valid public DOM ref element.

#### Target-preservation exemptions

| ID  | Component and path                                                                                                                                                                                                                                                                                                                                                                 | Retained styling target / public ref target                                                                                                                                                                                                                          | Reason / owning contract                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | CheckboxInput and Switch, all supported rendered modes                                                                                                                                                                                                                                                                                                                             | Outer whole-field `div` / native checkbox or switch `input`                                                                                                                                                                                                          | Preserve whole-field styling and the correctly exposed semantic-control ref. Neither composes Field or belongs to FR10's excluded root-styling set; shared API and respective control owners.                                                                                                                                                                                                                                          |
| E2  | CommandPaletteInput                                                                                                                                                                                                                                                                                                                                                                | Query wrapper `div` / query `input`                                                                                                                                                                                                                                  | Current `component:CommandPaletteInput` FR3 corroborates the separate visual-wrapper and native-control seams.                                                                                                                                                                                                                                                                                                                         |
| E3  | Horizontal Stepper, expanded or compact                                                                                                                                                                                                                                                                                                                                            | Horizontal frame `div` / ordered-list `ol`                                                                                                                                                                                                                           | Preserve frame styling and list measurement/ref identity; `component:Stepper`. Vertical list-target styling needs no target exemption.                                                                                                                                                                                                                                                                                                 |
| E4  | Timestamp and Timer, supported rendered temporal states                                                                                                                                                                                                                                                                                                                            | Outer Text `span` / inner `time`                                                                                                                                                                                                                                     | Preserve the existing temporal wrapper rather than moving general styles to `time`. `component:Timer` FR5/ORD2 and temporal component/shared API owners describe the seam; Timer's broader current timer-system wording remains an unresolved authority tension in OQ3.                                                                                                                                                                |
| E5  | ContextMenu and MoreMenu pointer/sheet paths                                                                                                                                                                                                                                                                                                                                       | Inner menu/content `div` / trigger wrapper or trigger button                                                                                                                                                                                                         | Existing general styles describe the menu, not its trigger. Shared API and menu owners retain that target; existing sheet ref-forwarding debt is not waived.                                                                                                                                                                                                                                                                           |
| E6  | DropdownMenu pointer/sheet; Popover automatic/custom/external-anchor; HoverCard text/element/fragment-trigger paths                                                                                                                                                                                                                                                                | DropdownMenu inner menu `div`, Popover inner painted `div`, or HoverCard floating `div` / no unprefixed component ref                                                                                                                                                | There is no unique outermost fallback across trigger, persistent template, host, and surface trees. Named/payload refs are not a component `ref`. `component:Popover` owns painted-surface styling; respective menu/HoverCard and shared API owners retain the other targets.                                                                                                                                                          |
| E7  | PowerSearch when the nested Tokenizer Field box renders                                                                                                                                                                                                                                                                                                                            | Nested Field box through Tokenizer's `container*` inputs / outer PowerSearch wrapper                                                                                                                                                                                 | Preserve the higher-level composition's current styling projection. Where the Field box is absent, the part has no effect and warns, never reroutes. `component:PowerSearch`, `component:Tokenizer`, and the input-family part contract; no root styling is added to Tokenizer.                                                                                                                                                        |
| E8  | InputClearButton's generic-tooltip path                                                                                                                                                                                                                                                                                                                                            | Native clear `button`; only accepted `xstyle` / no public component ref                                                                                                                                                                                              | Tooltip peers prevent unique outermost fallback. Shared API owner; missing class/style counterparts and incomplete icon-part inputs remain AST-071 obligations.                                                                                                                                                                                                                                                                        |
| E9  | Existing unrestricted custom-root APIs: Stack, HStack, VStack, StackItem, Item; custom link/router branches of Avatar, Button, IconButton, Link, Tab, Token, DropdownMenuItem/ContextMenuItem/BreadcrumbMenuItem, NavHeadingMenuItem, TopNavHeading, TopNavItem, TopNavMegaMenuItem, SideNavHeading, and SideNavItem; custom Icon root handoff and Table wrapper/transform handoff | Existing lowered class/inline-style and ref handoff to the caller component, not a newly selected DOM node; for Table, styling and the public ref remain on the received semantic table, which wrapper/context output may retain, wrap, duplicate, detach, or remove | Exemption from the new composed style/ref-identity proof requirement only. Preserve the released handoff without asserting that arbitrary caller output has a DOM ref or forwards styling. An object handle does not trigger outermost fallback. Native/built-in branches still owe their own identity contract; new APIs and divergence paths are not covered. `family:layout-primitives`, shared API, and each root/transform owner. |

#### Legacy default-enforcement exemptions

These are explicit exclusions from the new uniform-target check, not valid
replacement contracts. Existing current-owner obligations remain open. A failed
ref binding in the rows below does not authorize runtime outermost fallback.

| ID  | Component and path                                                                                | Existing gap in the ref-first target guarantee                                                                                             | Obligations retained                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | ChatComposer rendered frame/body paths                                                            | `style` and `className` reach the frame/public-ref element; `xstyle` reaches the body                                                      | Shared API INV5/INV6; no approved split target is inferred from a draft.                                                                              |
| L2  | SideNavItem rendered paths                                                                        | `xstyle` reaches the outer column; `className` and `style` reach the inner primary control/ref binding                                     | Shared API INV5/INV6/INV8; the split and ambiguous root-ref promise remain open.                                                                      |
| L3  | TopNav content-bearing drawer paths                                                               | All accepted general styling inputs and the public ref are dropped                                                                         | Shared API INV5/INV6/INV8; truly empty output is not an exemption by itself.                                                                          |
| L4  | SideNav content-bearing drawer-content paths                                                      | All accepted general styling inputs and the public ref are dropped                                                                         | Shared API INV5/INV6/INV8; a conditional footer root does not repair the loss.                                                                        |
| L5  | TypeaheadItem's nonempty caller `item.element` path                                               | Accepted general styling and public ref are not applied to the returned caller node                                                        | Shared API INV5/INV6/INV8; arbitrary caller output is not a guaranteed forwarder.                                                                     |
| L6  | SegmentedControlItem                                                                              | Accepted `className` is overwritten; dynamic StyleX output can overwrite the entire accepted inline `style`                                | Shared API INV5/INV6; this is lost styling, not a permissible split or precedence decision.                                                           |
| L7  | VisuallyHidden's accepted inherited `xstyle`, intrinsic and custom paths                          | `xstyle` is leaked/uninterpreted rather than applied to its ref element; `className` and `style` are not accepted                          | Shared API/AST-071 obligations and the styling-free intention require reconciliation; the exemption does not create styling support.                  |
| L8  | Icon's registry-rendered path; CheckIndicator's checked-glyph path                                | Existing styling reaches the rendered span, but the accepted public ref is not forwarded there; Icon additionally promises an SVG ref type | Exclusion from the new style/ref-identity proof only, not a new span-ref promise or INV8 waiver. Replacement/custom paths are separately scoped.      |
| L9  | Dialog, AlertDialog, and CommandPalette inline-open paths                                         | General styling reaches the inline `div`; the accepted dialog ref is unbound                                                               | Exclusion from the new style/ref-identity proof only. Existing INV8/declared-element debt remains; inline-closed null does not choose another target. |
| L10 | SideNav target-bearing topbar and drawer paths; TopNavMenu and TopNavMegaMenu drawer-header paths | Existing general styling reaches the topbar `div`, drawer dialog, or header button, but the accepted public ref is unbound                 | Exclusion from the new style/ref-identity proof only. Existing INV8 obligations remain; no outermost fallback or changed ref target is authorized.    |

InputGroup's general styling and actual public ref both reach its inner group
`div`, but its current Field-composition scope is unresolved under FR10. Matching
this default does not allow styling that another current owner forbids; OQ2
requires that owner decision. Declared-ref type mismatches on otherwise
co-targeted native branches likewise remain independent obligations, not reasons
to move styling.

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
exempted component's owning contract and consumer docs distinguish the styling
and public ref targets on the applicable paths. Current records are not rewritten
by this draft.

## Verification

| Contract | Verification                                                                                        | Representative states                                                                                                                                                 | Mutation or failure expectation                                                                              |
| -------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| FR1–FR2  | Distinct inline-style, class-name, and StyleX markers asserted against the public DOM ref element   | inner control, detached target, callback/object/omitted/null ref; closed/open surface                                                                                 | Passing or omitting ref changes the styling target; a null ref reroutes styling.                             |
| FR3–FR4  | Public-prop/type inspection and owned-root identity tests                                           | no exposed ref and one root; no exposed ref and peer roots; fully empty render, then mount; imperative handle including a DOM-valued member; ambiguous or dropped ref | An unusable ref triggers outermost fallback or a component with no valid target gains general styling props. |
| FR5      | Element/ref-identity fixtures and compatibility review                                              | intrinsic `as`, guaranteed composed target, unrestricted `as`, added/removed/retargeted ref                                                                           | Forwarding alone passes as identity proof or a ref API edit silently moves styles.                           |
| FR6      | Owning contracts, public types, semantic pass-through tests, and named-part markers                 | standalone, grouped, and horizontal-label fields; public named part refs                                                                                              | A Field-composed component gains forbidden root styling or a named ref retargets general/part styling.       |
| FR7      | Explicit component/path/style-target/ref-target exemption coverage and negative cases               | every retained target and relevant mode; new sibling and new render path                                                                                              | A blanket waiver hides a ref failure or covers an unlisted divergence.                                       |
| FR8      | Current-record consistency, consumer migration evidence, compatibility review, and release metadata | exemption retention; ref API edit; target move; prop removal                                                                                                          | A target changes silently or a draft is treated as authority.                                                |

## Decision log

### DEC-1 — General styling follows the public DOM ref

**Reference:** `spec:AST-089/DEC-1`
**Proposed decider:** `imdreamrunner`

Consumers can inspect, measure, focus, and style the same publicly addressable
DOM element. The unprefixed ref contract selects it even when the caller passes
no ref value. Only an API with no unprefixed ref uses the unique outermost root;
explicit exemptions preserve established targets.

Rejected: choosing the target from `ref.current` at runtime, because mounting or supplying a ref would move styling.

### DEC-2 — Existing divergences are explicit compatibility exemptions

**Reference:** `spec:AST-089/DEC-2`
**Proposed decider:** `imdreamrunner`

The default does not force a breaking target move, new ref API, or prop removal.
An exemption preserves only the named existing target and path. Named family
exclusions and their separately approved migrations retain their own authority.

Rejected: treating every existing divergence as an immediate migration prerequisite, because the default would force unrelated consumer changes.

## Open questions

- **OQ1 — Should the shared default target the public DOM ref or DOM ancestry?**
  (`human-api`) The ref-first default styles the documented public DOM ref target
  and uses the unique outermost root only when no unprefixed ref is exposed; the
  outermost default styles the whole owned root independently of ref identity.
  Either retains explicit existing exemptions. The shared API owners select one
  rule before promotion.
- **OQ2 — Does the Field-composed root-styling prohibition include InputGroup?**
  (`human-api`) InputGroup's styling and ref co-target its inner group, but its
  Field composition and collaborator classification leave current FR10 scope
  inconsistent. The family and direct API owners reconcile that scope; meeting
  this default does not waive FR10.
- **OQ3 — Which current timer claim owns the retained wrapper/ref split?**
  (`human-api`) `component:Timer` FR5/ORD2 retains Text-wrapper styling and a
  `time` ref, while `spec:AST-037` has broader root wording. The shared API and
  timer owners reconcile the current claims; E4 does not invent precedence.
