---
schema_version: 1
template_version: 1
kind: design
id: design:ordered-collection-reordering
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
owners: [ernestt, cixzhang]
review_triggers: [visual, interaction, accessibility, motion]
verified_by:
  [packages/lab/src/__tests__/ReorderGripPinchZoom.a11y.chromium.spec.ts]
architecture: [architecture:interaction-modality, architecture:theme-tokens]
components: []
families: []
deciding_specs: [spec:AST-103]
---

# Ordered collection reordering design specification

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/lab/src/reorderStyles.ts",
    "packages/lab/src/ListInput/**",
    "packages/lab/src/TransferList/**"
  ]
}
```

## User intent

A person reordering a list or row collection should understand what is moving,
where it will land, and when the change is committed. Pointer and keyboard paths
should communicate the same candidate position without making surrounding items
jump prematurely.

This treatment is for changing order within a collection. Freeform canvas
placement and file-drop targets require separate design specifications.

## Design principles

- **DR1 — Reordering begins from an explicit handle.** The interaction MUST start
  from a dedicated affordance so activation is intentional and other item
  actions remain available.
- **DR2 — The moving item remains recognizable without appearing elevated.** The
  source and pointer-following preview MUST read as the same item in a temporary
  moving state and MUST NOT imply a raised card.
- **DR3 — Placement is previewed before the collection changes.** A clear
  insertion cue MUST mark the candidate position while surrounding items remain
  stable until commit.
- **DR4 — Commit happens once.** The collection MUST adopt the new order on drop
  or release rather than repeatedly committing as the pointer crosses items.
- **DR5 — Completion restores normal hierarchy.** Temporary drag treatment MUST
  disappear immediately on drop or cancel, and settled items MUST return to
  their normal contrast and depth.

## Anatomy and hierarchy

| Role               | Purpose                                         | Required relationship                                                         |
| ------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| reorder handle     | Starts and retains ownership of the interaction | Belongs to one item and remains distinguishable from item activation          |
| stationary source  | Preserves the item's origin during active drag  | Remains in place until commit and shares temporary treatment with the preview |
| moving preview     | Follows pointer movement                        | Duplicates the source identity without adding raised-card elevation           |
| insertion cue      | Marks the candidate ordered position            | Appears between items on the collection's ordering axis                       |
| surrounding items  | Provide stable spatial context                  | Do not shift until the reorder is committed                                   |
| settled collection | Shows the resulting order                       | Returns every item to its normal state after completion                       |

## State representation

| State              | Required representation                                                     | Allowed variation                                                |
| ------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| rest               | The handle is discoverable without overpowering item content                | Handle placement may follow the collection family                |
| dragging           | Source and moving preview use the same temporary reduced-emphasis treatment | Pointer preview may move freely on both axes                     |
| candidate position | A clear accent insertion line marks where the item will land                | Line length and inset may follow row geometry                    |
| dropped            | Items settle into the committed order and temporary drag treatment clears   | Settling motion may use the system's fast movement language      |
| cancelled          | Original order and normal contrast return immediately                       | Cancellation may be immediate even when normal motion is enabled |

## Responsive and input behavior

- **DR6 — Placement follows the collection axis.** Pointer previews MAY move
  freely, while candidate order MUST be calculated on the collection's ordering
  axis.
- **DR7 — Keyboard and pointer share the insertion cue.** Keyboard reordering
  MUST expose the same candidate-position representation as pointer reordering.
- **DR8 — Reduced motion updates directly.** When motion is reduced, the final
  order MUST update without animated travel.

## Accessibility intent

Focus should remain with the reorder handle throughout the operation. Position
changes, cancellation, and completion should be announced in terms a person can
understand without seeing the preview. The temporary reduced-emphasis treatment
is acceptable only during active reordering and must not reduce the persistent
legibility of content.

Focus mechanics, keyboard commands, live-region wording, and collection mutation
belong to component and family contracts.

## Representative examples

- A row starts moving from its handle; the original row and pointer preview
  become temporarily quieter while a line marks the candidate gap.
- Keyboard movement changes the same insertion cue one position at a time while
  focus remains on the handle.
- Dropping commits once, then the collection settles into the new order.

## Visual references

No normative assets are included. Pointer and keyboard sequences belong under
`docs/design/assets/ordered-collection-reordering/`.

## Component contract links

`spec:AST-103` applies this treatment to every reorderable collection, its
keyboard reorder mode included (DR7).

Implementation gap: Lab's ListInput and TransferList draw no insertion line
when reordering by keyboard (DR7); ListInput's keyboard grab mode moves the
rows before the commit (DR3); and both build their own drag preview
(`architecture:component-style-authoring` INV7).

## Decision log

### DEC-1 — Reordering follows this design, not a slide-aside

**Reference:** `design:ordered-collection-reordering/DEC-1`
**Decider:** `cixzhang`, `2026-10-26`

While an item is dragged, the surrounding items stay where they are, the
source stays in place and dimmed, a moving preview follows the pointer, and an
accent insertion line between items marks where it will land; the items
rearrange once, at the drop, and a cancel restores at once. Keyboard
reordering shows the same insertion line. A drop marker, with motion only on
the release, is more accurate for small drop targets than neighbors that move
under the pointer.

Rejected: neighbors sliding aside during the drag.

## Open questions

- **OQ1 — Preview treatment.** Does reduced emphasis for both stationary source
  and moving preview remain appropriate across light, dark, and high-contrast
  themes?
- **OQ2 — Insertion geometry.** Which collection families need a deliberate
  exception to the default between-item insertion line?
- **OQ3 — Representative owner.** Which component or family should provide the
  canonical pointer and keyboard evidence?

## Content boundary

This file defines the visual and interaction intent of ordered reordering. It
does not define event handling, keyboard commands, focus implementation,
announcement strings, list mutation, token names, canvas placement, or file-drop
behavior.
