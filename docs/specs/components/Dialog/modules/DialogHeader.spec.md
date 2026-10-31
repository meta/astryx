---
schema_version: 3
template_version: 1
kind: module
id: module:Dialog/DialogHeader
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-23
owners: [cixzhang, imdreamrunner]
review_triggers: [theming, layout, public-api]
verified_by:
  [
    packages/core/src/Dialog/DialogHeader.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    packages/cli/foundation/discovery/theming-targets.test.mjs,
    scripts/check-knowledge.mjs,
  ]
parent_component: component:Dialog
references:
  [architecture:component-theming-surface, architecture:container-padding]
---

# DialogHeader module contract

## Intent

`DialogHeader` presents the title region of a Dialog and its optional close
control. This record owns the stable header-row, start-content, title-block,
end-content, and close-icon anatomy, their public theming targets, and the fixed
compensation applied to the existing end-content slot.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: two additive theme targets and one additive prop; omitted
  layout, paint, interaction, accessibility, and theming remain unchanged
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The header row that arranges title content and controls.
- The start-content wrapper for optional leading content.
- The title block that groups the title and optional subtitle.
- The existing end-content wrapper that groups optional trailing content with
  the close action.
- The fixed end-slot compensation derived from the medium close action's
  transparent inset.
- The close icon rendered for the optional close action.
- The `dialog-header`, `dialog-header-start-content`,
  `dialog-header-title-block`, `dialog-header-end-content`, and
  `dialog-header-close-icon` targets.

**Does not own / non-goals**

- Dialog modality, dismissal policy, or focus lifecycle — owned by
  `component:Dialog` and its linked system records.
- Generic Button or Icon presentation outside this module — owned by those
  components.
- List-style inherited container-padding compensation, caller-supplied margin
  values, or a general alignment primitive.

## Public API and concepts

This contract preserves the three existing theming surfaces, adds two content-
slot targets, and adds one slot-targeted compensation override.

| Concept                      | Closed values or states                          | Meaning                                                                               | Default                                               | Owner                        | Stability |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------- | --------- |
| Header row target            | present                                          | Styles the row that arranges title content and controls                               | Existing row visuals                                  | `module:Dialog/DialogHeader` | stable    |
| Start-content target         | present when start content renders               | Styles the wrapper for optional leading content                                       | Existing start-content layout                         | `module:Dialog/DialogHeader` | stable    |
| Title block target           | present                                          | Styles the title/subtitle grouping element                                            | Existing title stack visuals                          | `module:Dialog/DialogHeader` | stable    |
| End-content target           | present when end content or close action renders | Styles the wrapper that groups trailing content with the close action                 | Existing end-content layout                           | `module:Dialog/DialogHeader` | stable    |
| Close icon target            | present when close action renders                | Styles the close glyph itself                                                         | Existing medium Icon visuals                          | `module:Dialog/DialogHeader` | stable    |
| `endContentEdgeCompensation` | `inline`, `block`, `all`                         | Selects which axes of the existing end-content wrapper receive its fixed compensation | omitted; preserve automatic close-action compensation | `module:Dialog/DialogHeader` | stable    |

For this slot-targeted prop, `inline` means the slot's logical inline-end edge,
`block` means both block edges, and `all` combines them.

## Behavioral contract

| ID   | Invariant                                                                                                                                                                                                                                                   | Basis                                            | Review state |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------ |
| FR1  | The header row MUST carry `dialog-header` on the element that applies its row layout and gap.                                                                                                                                                               | Current implementation and owner decision        | settled      |
| FR2  | The title block MUST carry `dialog-header-title-block` on the element that applies its title/subtitle layout and gap.                                                                                                                                       | Current implementation and owner decision        | settled      |
| FR3  | The rendered close Icon MUST carry `dialog-header-close-icon` on the glyph element that applies icon presentation.                                                                                                                                          | Current implementation and owner decision        | settled      |
| FR4  | Omitting `onOpenChange` MUST continue to omit the close action and its optional close-icon anatomy.                                                                                                                                                         | Released behavior                                | settled      |
| FR5  | The existing end wrapper MUST continue to group optional `endContent` with the optional close action; this change MUST NOT add another wrapper.                                                                                                             | Current implementation                           | settled      |
| FR6  | When `endContentEdgeCompensation` is omitted, rendering the close action MUST preserve the released fixed negative block and logical inline-end inset, whether or not `endContent` is present. Without the close action, no automatic compensation applies. | Released behavior and owner decision             | settled      |
| FR7  | Explicit `inline` MUST apply only logical inline-end compensation; `block` MUST apply only both block edges; `all` MUST apply both. The explicit value overrides the automatic close-action selection.                                                      | `module:Dialog/DialogHeader/DEC-2`               | settled      |
| FR8  | Compensation MUST use logical inline properties, preserve title, slot, and close-action semantics and hit targets, and expose no caller-controlled margin amount.                                                                                           | `architecture:container-padding`; owner decision | settled      |
| FR9  | The leading content wrapper MUST carry `dialog-header-start-content` whenever optional start content renders.                                                                                                                                               | `module:Dialog/DialogHeader/DEC-3`               | settled      |
| FR10 | The existing trailing content wrapper MUST carry `dialog-header-end-content` whenever optional end content or the close action renders.                                                                                                                     | `module:Dialog/DialogHeader/DEC-3`               | settled      |

### Transformation and precedence order

1. If `endContentEdgeCompensation` is present, its closed value selects the
   compensated axes.
2. Otherwise, a rendered close action selects `all`; omission of the close
   action selects no compensation.
3. The module applies each theme target to its owning element before normal
   theme CSS resolves through the shared theming pipeline.

### Performance and resources

- The additive closed-value branch and class selection introduce no listener,
  observer, timer, measurement, or asynchronous resource.

## Accessibility contract

- Compensation and theme targets MUST NOT change the title's role, focus
  behavior, dialog naming, the close button's accessible name and operation, or
  any slot child's hit target.

## Design relationships

| Anatomy or state | Design requirement                                                                                                                       | Representation authority        | Module contract |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------- |
| Header row       | Owns arrangement and spacing among title content and controls.                                                                           | This module                     | FR1             |
| Start content    | Owns the leading wrapper for optional start content.                                                                                     | This module                     | FR9             |
| Title block      | Owns title/subtitle grouping and spacing.                                                                                                | This module                     | FR2             |
| End content      | Owns the existing trailing wrapper containing optional end content and the close action, including its fixed slot-targeted compensation. | This module                     | FR4–FR8, FR10   |
| Close icon       | Owns the close glyph's visual box inside the Button-owned action.                                                                        | This module with Icon rendering | FR3, FR4        |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Header row": {"target": "dialog-header"},
  "Start content": {"target": "dialog-header-start-content"},
  "Title block": {"target": "dialog-header-title-block"},
  "End content": {"target": "dialog-header-end-content"},
  "Close icon": {"target": "dialog-header-close-icon"}
}
```

## Parent and system relationships

- `component:Dialog` owns modal behavior and the aggregate Dialog contract.
- `component:Layout` owns the composed LayoutHeader region outside the five
  module-owned inner parts.
- `component:Button` owns the close action's control behavior, hit target, and
  outer presentation.
- `component:Icon` renders the glyph; this module guarantees a distinct target
  for the close icon's DialogHeader-specific visual contract.
- `architecture:component-theming-surface` owns target qualification, anatomy
  mapping, and the requirement that each target sits on its painter.
- `architecture:container-padding` defines the retained-inset edge-compensation
  intent and distinguishes this slot-targeted projection from List-style
  inherited-inset self-compensation and full bleed.

## Verification map

| Contract            | Verification                                                                    | Representative states                                                     | Mutation or failure expectation                                                              |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| FR1–FR3, FR9–FR10   | Target tests, target inventory, generated probe theme, and source inspection    | title only, title/subtitle, start content, end content, close action      | A target is missing, undocumented, duplicated, or moved away from its owning painter.        |
| FR4–FR5             | Existing content and close-button tests                                         | end content only; close only; both                                        | The close action or slot content disappears, reorders, or gains another wrapper.             |
| FR6–FR7             | Focused end-slot class-selection assertions                                     | close only; end content only; both; explicit `inline`, `block`, and `all` | An omitted prop changes released geometry, or an explicit value selects the wrong axes.      |
| FR8                 | Source inspection, RTL CI, interaction tests, and focused real-browser geometry | LTR and RTL; custom end control; close action                             | Physical margins, caller-controlled amounts, or hit-target changes enter the implementation. |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                   | all five module anatomy entries and targets                               | Anatomy, docs, runtime targets, and the module map drift.                                    |

## Decision log

### DEC-1 — Header targets follow stable anatomy and visual ownership

**Reference:** `module:Dialog/DialogHeader/DEC-1`
**Decider:** cixzhang, 2026-09-14

Each public target represents documented anatomy and is applied to the element
that owns the corresponding visuals. The header row, title block, and close icon
meet that admission rule and are approved as additive targets.

### DEC-2 — End-content compensation is slot-targeted and explicit

**Reference:** `module:Dialog/DialogHeader/DEC-2`
**Decider:** cixzhang, 2026-09-22

DialogHeader preserves its released automatic compensation whenever the close
action renders. `endContentEdgeCompensation` targets the existing end-content
slot and selects `inline`, `block`, or `all` without exposing a margin amount.
This is a slot-targeted projection of the retained-inset edge-compensation
intent; it does not make DialogHeader a List-style inherited-padding consumer.

### DEC-3 — Content-slot wrappers are approved target destinations

**Reference:** `module:Dialog/DialogHeader/DEC-3`
**Decider:** cixzhang, 2026-09-23

The existing wrappers for `startContent` and `endContent` are approved as stable
visible anatomy. Their target destinations are
`dialog-header-start-content` and `dialog-header-end-content`; implementation
must add no wrapper and must preserve default layout, paint, interaction,
accessibility, and public props. The end-content name follows the public prop
even though that slot also contains the optional close action.

## Open questions

None.

## Content boundary

This record does not duplicate consumer signatures/examples, parent Dialog
behavior, implementation steps, or shared theming rules. It links to their
canonical owners.
