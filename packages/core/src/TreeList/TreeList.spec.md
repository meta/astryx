---
schema_version: 3
template_version: 5
kind: component
id: component:TreeList
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-20
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/TreeList/TreeList.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:navigation-destinations]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
system_specs:
  [spec:AST-002/DEC-1, spec:AST-005/DEC-1, spec:AST-094/FR4, spec:AST-105]
---

# TreeList component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Each `TreeListItemData` may carry the standard `className`, `style`, and `xstyle` styling inputs for its Item row.                                                                                                                                                           |
| Behavior                | All supplied styling inputs compose on the same Item row box—the element that paints the row, owns its hover state, and contains its visible content. They do not target the outer semantic `<li>`.                                                                          |
| End-user impact         | A builder can reveal or style content for one row without causing every row in the tree to react.                                                                                                                                                                            |
| Builder impact          | The three standard styling mechanisms remain interchangeable parts of one row-styling seam. A builder may use one or combine them; no existing callsite must opt in.                                                                                                         |
| Compatibility/readiness | The contract is additive and preserves default output, except FR8's group motion under a coarse pointer. Its authority is current; implementation support may arrive separately, but the durable API is incomplete until all three mechanisms are supported on the same row. |
| Review checks           | Reject an implementation that omits one mechanism from the durable API, sends the mechanisms to different elements, drops a supplied value, targets the semantic `<li>`, or moves the promised row target without an explicit compatibility decision.                        |
| Governing rules         | [Public component API INV5–INV6](../../../../docs/architecture/public-component-api.md) and [AST-002 FR1, FR4, FR7–FR10, FR12, and DEC-1](../../../../docs/specs/AST-002/spec.md) govern admission, predictability, and composition of the component-local styling seam.     |

This table is a review projection; the body below is authoritative.

## Intent

TreeList presents hierarchical data as expandable tree rows. It owns the stable
row boundary needed for one item's caller-supplied presentation or relational
styling to differ from its peers without exposing the semantic list container or
requiring product code to reconstruct TreeList behavior.

## Compatibility and migration

- Released default preserved: `no` under a coarse primary pointer, where a
  toggled group slides (FR8); fine pointers are unchanged without an
  `animatedLayout` handle
- Compatibility class: additive optional public API, plus FR8's group motion
  under a coarse pointer; no other default rendering, DOM, styling, or
  interaction changes when the inputs are absent
- Controlled/uncontrolled behavior: unchanged
- Migration decision: none; existing callsites remain valid

The durable contract includes `className`, `style`, and `xstyle` even while
implementation work is staged. Current implementation availability does not narrow
the accepted API direction. Consumer syntax and release timing belong in
`TreeList.doc.mjs` and release notes.

## Ownership boundary

**Owns**

- The Tree list, Item, Chevron, Item label, and Guide parts and their five current
  targets.
- The stable Item description rendered below an Item label.
- Hierarchical placement, indentation, expansion, selection, and tree semantics.
- One stable per-item styling seam on the Item row box.

**Does not own / non-goals**

- The caller's style values, selector vocabulary, or authored class names.
- A styling seam on the semantic `<li>`, child group, or caller-provided slot
  content.
- The Chevron glyph artwork and Icon target — owned by `component:Icon`.
- Header, Start content, and End content supplied through consumer slots — owned
  by the product callsite.
- New targets for Item description or caller-provided slots.

## Public concepts

| Concept          | Closed values or states               | Meaning                                                                                        | Availability by variant/orientation/state | Default | Owner                | Stability | Invalid-value behavior                                          |
| ---------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- | ------- | -------------------- | --------- | --------------------------------------------------------------- |
| Item row styling | `className`, `style`, and/or `xstyle` | Applies caller-supplied classes, inline styles, or StyleX styles to one item's stable row box. | Every rendered item row                   | Absent  | `component:TreeList` | Stable    | TypeScript rejects unsupported values; supplied inputs compose. |

The three mechanisms are one styling concept, not three separate feature tiers.
Supporting one does not justify omitting another from the durable contract.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Basis                                                                               | Contract state                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| FR1 | The current render contains one Tree list, one Item and Item label per rendered node, optional Header, Chevron, Item description, Start content, End content, and Guide parts, and delegated Chevron glyphs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source, docs, and tests                                                     | Current behavior                                    |
| FR2 | Tree list, Item, Chevron, Item label, and Guide carry the five current `tree-list*` targets documented below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source and target docs                                                      | Current behavior                                    |
| FR3 | Chevron glyph delegates to Icon's `icon` target. Header, Start content, and End content are consumer-owned and have no TreeList target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and component docs                                                   | Current ownership                                   |
| FR4 | Item description is a stable library-rendered part below Item label and currently has no public target. It does not inherit through `tree-list-item-label`; both spans are siblings inside the row content.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source and target docs                                                      | Current reachability gap; no new target is accepted |
| FR5 | `TreeListItemData` MUST admit `className`, `style`, and `xstyle` as one per-item styling seam. Every supplied value MUST compose on the same Item row box; an implementation MUST NOT treat current support for only one mechanism as authority to exclude the other two.                                                                                                                                                                                                                                                                                                                                                                                                                                     | Owner decision; `architecture:public-component-api` INV5–INV6; `spec:AST-002/DEC-1` | Settled intent; implementation may be staged        |
| FR6 | The Item row box is the logical element that paints the row, owns its hover state, and contains Start content, Item label and description, and End content. The styling seam MUST NOT move to the semantic `<li>` or another element without a compatibility decision.                                                                                                                                                                                                                                                                                                                                                                                                                                        | Owner decision and the caller-owned per-row interaction boundary                    | Settled intent                                      |
| FR7 | A click on an Item row outside its Item label performs the row's action: an Item with `onClick` runs it; otherwise an Item with children toggles; otherwise an Item whose only action is its link follows that link as Enter does, with modified and middle clicks following the shared enlarged-surface rule in `family:navigation-destinations`. The Chevron and controls in Start content and End content keep their own activation, and a disabled Item does nothing.                                                                                                                                                                                                                                     | Owner decision; `family:navigation-destinations`                                    | Settled intent; implementation may be staged        |
| FR8 | Expanding or collapsing an Item with children MUST play its group's own motion: under a coarse primary pointer its rows slide out from under the parent as one block, clipped to the group's box, and back on collapse, a collapsing group's rows leaving the accessibility tree as the slide starts, while the Chevron turns, by transform only (`spec:AST-094` FR4–FR5); under a fine pointer the group appears and leaves at once. With an `animatedLayout` handle, the group and the rows after it follow `spec:AST-105`'s shared motion under every pointer (FR4, FR5); without one, the group's own slide stays touch-only and the rows after the group take their places at once (`spec:AST-105` FR2). | UIKit outline list (`UICollectionView`), iOS 26.2; `spec:AST-105` FR2               | Proposed; awaiting an engineering owner's approval  |

### Allowed variation

- **AV1 — Hierarchy.** Item count, depth, expansion, selection, density, and guide
  visibility may vary without changing the anatomy ownership recorded here.
- **AV2 — Consumer content.** Header, Start content, End content, Item label
  values, and descriptions may vary without making caller-owned slot content a
  TreeList target.
- **AV3 — Delegated glyph.** Icon may change the Chevron glyph's internal element
  shape while preserving its own public contract.
- **AV4 — Row implementation.** The row's HTML tag and internal descendants may
  change while the same logical row remains the target of all three styling
  inputs and keeps the observable boundary in FR6.
- **AV5 — Expansion motion.** Without an `animatedLayout` handle, under a fine
  pointer a group appears and leaves at once; under reduced motion nothing travels: under a coarse primary
  pointer the group fades in where it lands and out where it is (DR2), and
  otherwise it changes at once (`design:reduced-motion` DR3).

### Representative states

| State                    | Required invariant                                                                          | Allowed variation                             |
| ------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Empty tree               | Tree list remains; no Item instances render.                                                | Optional Header content.                      |
| Flat items               | Each Item contains an Item label.                                                           | Description and consumer slots may be absent. |
| Styled item              | The supplied `className`, `style`, and `xstyle` values compose on only that item's row box. | Any subset of the three inputs may be absent. |
| Expandable item          | Item may contain Chevron and delegated Chevron glyph.                                       | Expanded or collapsed state.                  |
| Item toggled by a finger | Its group slides out from under it, or back, as one block while the Chevron turns.          | Reduced motion: a fade, no travel.            |
| Nested `lineGuides` tree | Guide instances show parent-child relationships.                                            | Count and position follow hierarchy.          |
| `noGuides` tree          | Guide instances are absent; indentation remains.                                            | All other anatomy remains unchanged.          |
| Described item           | Item description renders below Item label.                                                  | Caller-provided description text.             |

### Transformation and precedence order

- **ORD1 — Item row styling.** Apply the Item target and component-owned row
  styles, then consumer `xstyle`, then `className`, then inline `style`, using the
  shared merge behavior. All three inputs combine; none replaces or suppresses
  another input as a whole.

### Performance and resources

- The per-item styling seam adds no measurement, listener, observer, or global
  resource requirement.

## Accessibility contract

The styling seam does not change TreeList's tree, treeitem, group, roving-focus,
expansion, selection, disabled, or activation behavior. Styling inputs MUST NOT
replace component-owned semantic or interaction props.

- **AR1 — TreeList adopts the APG Tree View pattern** (`spec:AST-020/FR15`), as
  one composite control: the Tree list is `role="tree"`, named by its Header
  when one is rendered and otherwise by the caller's `aria-label` or
  `aria-labelledby`; every row is `role="treeitem"`, named by its label and described by its
  description, `aria-expanded` when it has children,
  `aria-selected` when it is the selected row, `aria-level` for its depth, and
  `aria-posinset`/`aria-setsize` among its siblings; children sit in a `role="group"`. One row holds the Tab stop
  (roving focus). ArrowDown/ArrowUp move between visible rows; ArrowRight expands
  a closed row, then moves into its first child, and ArrowLeft collapses an open
  row or moves to the parent — mirrored under RTL; Home and End move to the first
  and last visible rows; Enter and Space activate the focused row; typing letters
  moves to the next row whose label starts with them. Selection is caller-owned:
  callers mark at most one row selected (`isSelected`); the tree does not
  enforce it, claims no `aria-multiselectable`, and has no selection keyboard.

## Design relationships

| Anatomy or state | Design requirement                                                               | Representation authority        | Hierarchy role    | Component contract |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------- | ----------------- | ------------------ |
| Tree list        | Groups the hierarchical tree and owns its density and guide variant.             | Current source and public docs  | Supporting        | FR1, FR2           |
| Header           | Visibly names the tree with caller-provided content.                             | Caller-supplied content         | Prominent         | FR1, FR3           |
| Item             | Paints one row and reflects density, selection, disabled state, and row styling. | Current source and owner choice | Prominent         | FR1, FR2, FR5, FR6 |
| Chevron          | Provides the expand and collapse control for an Item with children.              | Current source and public docs  | Supporting        | FR1, FR2           |
| Chevron glyph    | Presents the current directional symbol inside Chevron.                          | `component:Icon`                | Supporting        | FR1, FR3           |
| Item label       | Presents the primary content that identifies an Item.                            | Current source and public docs  | Prominent         | FR1, FR2           |
| Item description | Presents stable secondary text below Item label.                                 | Current source and public docs  | Supporting        | FR1, FR4           |
| Start content    | Presents caller-provided content before Item label.                              | Caller-supplied content         | Context-dependent | FR1, FR3           |
| End content      | Presents caller-provided content after Item label.                               | Caller-supplied content         | Context-dependent | FR1, FR3           |
| Guide            | Paints a connector between related hierarchy levels.                             | Current source and public docs  | Supporting        | FR1, FR2           |

Item description is stable TreeList-rendered anatomy, not consumer-owned slot
structure. Its current lack of a target is a reachability gap, not a decision
that it must remain unthemeable. Header, Start content, and End content remain
caller-owned even though TreeList positions their slot wrappers.

### Design decisions

<!-- design-decisions:v1 -->

| ID  | Decision                                                                                                                     | Intent or reason                                                                                                                                                                                               | Applies to                                                                             | Allowed variation                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DD1 | Every Item spans the full width of the tree list at any depth; its nesting indent sits inside the row, ahead of its content. | Hover, pressed, and selected fills line up across depths, so the tree reads as one list of equal rows while labels keep their per-level alignment.                                                             | Item at every depth, at rest and through hover, pressed, selected, disabled, and focus | Themes set the indent step with `--tree-list-indent` and may restyle the row's fill, radius, and padding; row padding adds to the indent instead of replacing it. |
| DD2 | A nested Item's indent area is part of the row's painted target: it shows the row's hover and press feedback.                | The whole painted row reads as one target, matching where a click acts (FR7), so no part of a row lights up apart from the rest.                                                                               | Nested Items that act on click                                                         | Themes may restyle the feedback through the `tree-list-item` target.                                                                                              |
| DD3 | Guides paint above row fills, and an Item whose focus ring is showing paints above the guides.                               | Hierarchy lines stay continuous through hover and selection, and the focus indicator is never cut; on a focused row that is also filled, the ring takes precedence and the fill covers the guides at that row. | Guide and Item in `lineGuides` trees                                                   | Themes may recolor or hide guides through the `tree-list-guide` target.                                                                                           |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Tree list": {"target": "tree-list"},
  "Header": {
    "none": {
      "reason": "intentional: Header is caller-provided content outside TreeList's public theming ownership"
    }
  },
  "Item": {"target": "tree-list-item"},
  "Chevron": {"target": "tree-list-chevron"},
  "Chevron glyph": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Item label": {"target": "tree-list-item-label"},
  "Item description": {
    "none": {
      "reason": "reachability-gap: No current public target reaches the stable Item description"
    }
  },
  "Start content": {
    "none": {
      "reason": "intentional: Start content is caller-provided content outside TreeList's public theming ownership"
    }
  },
  "End content": {
    "none": {
      "reason": "intentional: End content is caller-provided content outside TreeList's public theming ownership"
    }
  },
  "Guide": {"target": "tree-list-guide"}
}
```

The five local targets are current public seams. The Chevron glyph retains Icon
ownership. Consumer-slot `none` dispositions are ownership boundaries. Item
description's `none` disposition records current reachability only and does not
authorize or prohibit a future target.

## Family and system relationships

- `architecture:public-component-api` owns the shared `className`, `style`, and
  `xstyle` composition order and preservation rules; this record admits that seam
  for each TreeList Item row and fixes its target.
- `architecture:component-theming-surface` owns anatomy qualification, target
  mapping, delegation, and factual `none` dispositions.
- `architecture:interaction-modality` owns shared keyboard and pointer modality;
  TreeList continues to own its existing tree focus and activation behavior.
- `family:navigation-destinations` owns the shared accept/block result for a
  TreeListItem `href`; `spec:AST-005/DEC-1` requires native and custom-router
  item paths to preserve that result.
- TreeList's current custom-router path inherits the `useLinkComponent` adoption
  gap recorded by the family until the accepted implementation lands.
- `spec:AST-105` owns the animated layout handle and how the content after a
  toggled group moves; TreeList owns only the group's own motion (FR8).

## Verification map

| Contract            | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Representative states                                                                                                                                                | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                 | Audit section                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR1                 | `TreeList.test.tsx` rendering, hierarchy, slot, and accessibility suites plus source inspection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Flat, nested, described, headed, and slotted items                                                                                                                   | Removing asserted Tree list, Header, Item, Chevron, Item label, Item description, Start content, End content, or Guide behavior fails existing role, content, hierarchy, or state assertions; Chevron glyph presence remains source-inspected only.                                                                                                             | `audit:TreeList/anatomy`       |
| FR2                 | `TreeList.test.tsx` and `themingTargets.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Five local targets and their documented states                                                                                                                       | Removing or moving any current local target fails focused class assertions or the global inventory.                                                                                                                                                                                                                                                             | `audit:TreeList/theming`       |
| FR3                 | Source inspection plus Icon public target metadata                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Expandable rows and caller-provided slots                                                                                                                            | Existing focused tests do not assert the composed Icon instance; changing glyph or slot ownership requires this map and the relevant owner metadata to change.                                                                                                                                                                                                  | `audit:TreeList/theming`       |
| FR4                 | `TreeList.test.tsx` description rendering test and source inspection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Item with description                                                                                                                                                | Removing description fails content coverage; adding a target requires an explicit map update.                                                                                                                                                                                                                                                                   | `audit:TreeList/anatomy`       |
| AR1                 | Tree View accessibility contract (`internal/a11y-spec`, pending) bound to TreeList, in jsdom and Chromium; `TreeList.test.tsx` row-naming cases ("names a parent row by its label alone, not the chevron toggle", "names a plain row by its label and describes it with its description", "names and describes link and action rows themselves, not only their inner control", "keeps start and end content, including controls, out of the row name", "typeahead matches the label, not the description or start content") and `TreeListRowNames.a11y.chromium.spec.ts` for the browser-computed names; `TreeList.test.tsx` structural ARIA cases ("sets aria-level, aria-posinset, and aria-setsize at the top level", "sets aria-level/posinset/setsize correctly at deeper levels", "sets aria-level across three depths"); `TreeList.test.tsx` and `useTreeFocus.test.tsx` keyboard suites | Flat and nested trees; expanded/collapsed; selected/unselected; LTR and RTL; typeahead                                                                               | A row loses its role, label name, state or position, two rows hold a Tab stop, an arrow key stops moving or stops mirroring under RTL, Home/End or typeahead stop working, or the tree claims multi-select                                                                                                                                                      | `audit:TreeList/accessibility` |
| FR5, FR6, ORD1      | Focused `TreeList.test.tsx` row-identity and styling-composition coverage, required with implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | One input at a time; all three together; sibling rows                                                                                                                | Dropping any mechanism, applying mechanisms to different elements, targeting the `<li>`, changing the merge order, or styling a sibling row fails.                                                                                                                                                                                                              | `audit:TreeList/api`           |
| FR7                 | Focused `TreeList.test.tsx` row-click coverage, required with implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Action, parent, link, and disabled rows; clicks in the indent and padding, on the Chevron, and on Start and End content controls; plain, modified, and middle clicks | A click outside the label does nothing or runs the wrong action, a link-row click reaches ancestors twice, the Chevron or a Start or End content control activates the row, or a disabled row acts.                                                                                                                                                             | `audit:TreeList/behavior`      |
| FR8                 | Real-browser frame evidence under a finger and a mouse                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | expand and collapse; a toggle mid-motion; reduced motion; rows after the group, with and without an `animatedLayout` handle                                          | Rows inside the group that jump, travel under a fine pointer without a handle or under reduced motion, an animated property under a fine pointer with reduced motion, a fade under a mouse without a handle, collapsing rows still in the accessibility tree during the slide, layout or paint per frame, or rows after the group moving without a handle fails | `audit:TreeList/behavior`      |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Canonical anatomy and five current local targets                                                                                                                     | Missing, extra, duplicated, prefixed, or stale mappings fail repository validation.                                                                                                                                                                                                                                                                             | `audit:TreeList/theming`       |

Focused target-placement assertions cover all five local targets. Runtime support
and mutation-sensitive coverage for the item styling seam may land separately,
but every implementation is judged against the complete three-mechanism contract.

## Decision log

### DEC-1 — Each Item row supports the complete standard styling seam

**Reference:** `component:TreeList/DEC-1`
**Decider:** cixzhang, 2026-09-20

A caller may attach `className`, `style`, and `xstyle` to one TreeList item. All
three compose on the Item row box so per-row presentation and relational styling
can remain scoped to that row. `className` is intentionally supported, including
for a StyleX marker class; the standard `style` and `xstyle` mechanisms remain
part of the same durable seam even if implementation work arrives in stages.

Rejected: exposing only `className` because it is sufficient for the motivating
marker use case. That would make a temporary implementation slice define a
permanent exception to Astryx's standard styling contract.

Rejected: applying the seam to the outer semantic `<li>`. That element owns tree
semantics and child grouping, while the row box is the stable visual and hover
boundary callers need to address.

### DEC-2 — The tree is one composite control with single, caller-owned selection

**Reference:** `component:TreeList/DEC-2`
**Decider:** `cixzhang`, `2026-10-13`

TreeList already plays the Tree View's role as one widget — one Tab stop, arrows, Home/End, activation, typeahead — so it adopts the pattern's keyboard model except the optional `*` key (AR1), not only the required parts. Callers mark at most one row selected (`isSelected`) and the tree does not enforce it, so the tree never claims `aria-multiselectable` and adds no range or toggle keyboard.

Rejected: multi-select (`aria-multiselectable`, Shift/Ctrl ranges); a Tab stop per row.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, shared modality
rules, current audit results, implementation steps, or family/system rules. It
links to their owners.
