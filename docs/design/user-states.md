---
schema_version: 1
template_version: 1
kind: design
id: design:user-states
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-19
owners: [ernestt, cixzhang]
review_triggers: [visual, interaction, accessibility]
verified_by:
  [
    packages/core/src/__tests__/PressedState.a11y.chromium.spec.ts,
    packages/core/src/CheckboxInput/CheckboxInput.test.tsx,
    packages/core/src/Collapsible/Collapsible.test.tsx,
    packages/core/src/Link/Link.test.tsx,
    packages/core/src/RadioList/RadioList.test.tsx,
    packages/core/src/SegmentedControl/SegmentedControl.test.tsx,
    packages/core/src/Slider/Slider.test.tsx,
    packages/core/src/Switch/Switch.test.tsx,
    packages/core/src/TabList/TabList.test.tsx,
  ]
architecture: [architecture:interaction-modality, architecture:theme-tokens]
components:
  [
    component:CheckboxInput,
    component:Collapsible,
    component:Link,
    component:Slider,
    component:Switch,
    component:TabList,
    component:RadioList,
    component:SegmentedControl,
  ]
families: []
deciding_specs: []
---

# User states design specification

## User intent

A pointer user holding or dragging an enabled control should receive immediate,
consistent feedback on the surface being manipulated. The feedback must not imply
that a disabled control responded, and it must not erase a persistent selected
surface.

## Design principles

- **DR1 — Press the manipulated surface.** During pointer hold or drag, each
  enabled surface in the matrix below MUST paint `--color-overlay-pressed` on
  the named visual part. The overlay is transient and MUST clear when the press
  or drag ends. Under a finger, the overlay's timing follows `spec:AST-094` FR11's press profiles.
- **DR2 — Disabled means no response.** A disabled control in the matrix MUST
  remain inoperable and MUST NOT gain a pressed visual treatment.
- **DR3 — Persistent selection wins.** A selected SegmentedControl item MUST
  keep its raised selected surface during pointer hold; only an unselected item
  receives the pressed overlay. Under a finger the item keeps that surface, and its press timing follows
  `spec:AST-094` FR11.

## Anatomy and hierarchy

| Role                        | Purpose                                  | Required relationship                                                         |
| --------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| interaction target          | Receives the pointer hold or drag        | Owns or controls the paint surface named in the matrix                        |
| pressed overlay             | Confirms the active manipulation         | Composes over the existing fill without replacing content or persistent state |
| persistent selected surface | Communicates an already-selected segment | Remains visually unchanged during pointer hold                                |

## State representation

| Component        | Enabled pointer hold or drag                                                                              | Disabled pointer hold                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| CheckboxInput    | Indicator paints `--color-overlay-pressed`                                                                | Indicator remains unchanged                                    |
| Collapsible      | Trigger row paints `--color-overlay-pressed`                                                              | Trigger row remains unchanged and does not expand or collapse  |
| Link             | Text surface paints `--color-overlay-pressed`                                                             | Text surface remains unchanged and does not activate           |
| Slider           | Only the dragged thumb paints `--color-overlay-pressed`                                                   | Thumb remains unchanged and the value does not change          |
| Switch           | Track and thumb both paint `--color-overlay-pressed`                                                      | Track and thumb remain unchanged and the value does not change |
| TabList Tab      | Tab surface paints `--color-overlay-pressed`                                                              | Tab surface remains unchanged and selection does not change    |
| RadioList        | Indicator paints `--color-overlay-pressed`                                                                | Indicator remains unchanged and selection does not change      |
| SegmentedControl | An unselected item paints `--color-overlay-pressed`; the selected item keeps its raised surface unchanged | Item surface remains unchanged and selection does not change   |

This table is the complete current claim. It does not approve pressed treatment
for other components or settle their state design.

## Responsive and input behavior

- **DR4 — Follow the real interaction.** Hold-driven controls keep the overlay
  only while the pointer is down. Slider follows its existing drag state so the
  overlay stays on the thumb being dragged, including when the drag began on the
  track.
- **DR5 — Preserve the resting result.** After release or cancellation, the
  component MUST return to the same visual state it would otherwise have had;
  pressed feedback does not create a persistent state.

## Accessibility intent

Pressed feedback supplements, and never replaces, the control's semantic state,
label, focus indication, or disabled behavior. A control that is exposed as
disabled must remain inoperable even when its implementation keeps it focusable
to explain why it is unavailable.

## Representative examples

- Holding an enabled CheckboxInput row darkens its indicator; releasing outside
  without activation restores the original indicator pixels.
- Dragging a range Slider paints only the thumb currently being moved.
- Holding the selected SegmentedControl item leaves its raised surface unchanged;
  holding an unselected item paints the pressed overlay.

## Visual references

The real-Chromium evidence generated by
`packages/core/src/__tests__/PressedState.a11y.chromium.spec.ts` captures matched
rest, held-pointer, released, disabled, and selected-exception surfaces for the
eight components. CI publishes those PNGs, pixel diffs, Chromium version,
viewport, story IDs, hashes, and exact PR-head SHA in the
`pressed-state-evidence` artifact. Generated evidence validates this record but
is not a normative design asset.

## Component contract links

The `components` frontmatter list is the machine-readable adoption matrix for
DR1–DR5. Component records do not duplicate this cross-component decision.

## Decision log

### DEC-1 — Use the system pressed overlay on the bounded eight-component matrix

**Reference:** `design:user-states/DEC-1`
**Decider:** `cixzhang`, 2026-09-19

Consistent feedback helps pointer users understand which enabled surface is
actively responding. The decision is intentionally limited to the surfaces in
the matrix, preserves disabled behavior, and keeps an already-selected segment's
raised surface stable.

## Open questions

None for this bounded pressed-state decision. Hover, focus, selection treatments
outside the selected-segment exception, and adoption by other components remain
outside this record's current claim.

## Content boundary

This file defines the approved cross-component pressed-state intent and its
bounded adoption matrix. Component implementations own selectors and event
mechanics; architecture records own interaction modality and token behavior;
tests and CI artifacts own current conformance evidence.
