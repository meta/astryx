---
schema_version: 3
template_version: 4
kind: component
id: component:FileInput
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-14
owners: [cixzhang, imdreamrunner]
review_triggers: [theming]
verified_by:
  [
    packages/core/src/FileInput/FileInput.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:input-fields]
design_specs: []
architecture: [architecture:component-theming-surface]
contributing: []
system_specs: []
---

# FileInput component contract

## Intent

FileInput presents a labelled file-selection field in compact input or dropzone
form. This contract records its current consumer anatomy and approves separate theme
ownership for the upload affordance that FileInput paints through Icon.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: additive public theming target; no existing target,
  runtime default, DOM, prop, interaction, or accessibility behavior changes
- Controlled/uncontrolled behavior: unchanged; FileInput remains controlled
- Migration decision: `component:FileInput/DEC-1`

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The visible file-selection surface and its input/dropzone mode.
- Whether, where, and at what default size the upload affordance appears.
- Reflecting FileInput's mode on its locally owned theme targets.

**Does not own / non-goals**

- The upload artwork or Icon's base color, size, and accessibility semantics —
  owned by `component:Icon`.
- Label, description, clear-control, and validation-message presentation — owned
  by `component:Field` and `component:FieldStatus`.
- Loading-indicator presentation — owned by `component:Spinner`.
- A new prop, variant, icon slot, or custom property.

## Public concepts

No consumer prop changes. The `file-input-icon` target gives themes a
same-element seam for the Upload icon and reflects the existing `mode` axis. The
existing `file-input` target remains on the visible selection surface and keeps
its `mode` and `status` axes.

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                  | Basis                                             | Review state                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------- |
| FR1 | The visible selection surface carries `file-input` and reflects the existing `mode` and resolved status.                                                                                                             | Current source, public docs, and focused tests    | Verified current behavior       |
| FR2 | When not loading, input mode renders an upload affordance at the small Icon size. Dropzone mode renders it at the medium Icon size only while no file is selected.                                                   | Current source and focused tests                  | Verified current behavior       |
| FR3 | Icon owns the rendered glyph's base size, color, and accessibility semantics; FileInput owns the affordance's mode-dependent placement and default size.                                                             | Current composition and component boundaries      | Verified current composition    |
| FR4 | The rendered upload affordance MUST carry `file-input-icon` with the existing `mode` reflected, so a theme can restyle the glyph box without structural selectors or changing every Icon that uses the same artwork. | Owner-approved target contract                    | Approved additive contract      |
| FR5 | Adding the target MUST NOT change the default artwork, computed layout, interaction, file-selection behavior, accessible name, or decorative Icon semantics.                                                         | Compatibility policy and focused regression tests | Required compatibility behavior |

### Allowed variation

- **AV1 — Theme paint.** A theme may change standard visual
  properties such as the upload glyph's size or color through
  `file-input-icon`; FileInput still owns whether and where the affordance renders.
- **AV2 — Artwork.** Icon registry and future icon-slot decisions may change the
  artwork without changing this CSS target's ownership of the painted glyph box.

### Representative states

| State                    | Required invariant                                                       | Allowed variation                       |
| ------------------------ | ------------------------------------------------------------------------ | --------------------------------------- |
| Input, empty or selected | Small upload affordance renders on the input surface when not loading.   | Files, placeholder, status, theme paint |
| Dropzone, empty          | Medium upload affordance renders above the placeholder when not loading. | Drag state, placeholder, theme paint    |
| Dropzone, selected       | File names replace the upload affordance.                                | File names and status                   |
| Loading                  | Spinner replaces the upload affordance.                                  | Mode and loading presentation           |

### Transformation and precedence order

- **ORD1 — Content selection.** Resolve loading and selected-file state, choose
  input or dropzone content, then render the mode-sized upload affordance only in
  the states recorded by FR2.
- **ORD2 — Theme composition.** Icon applies its base size and color, then the
  same-element FileInput target participates in the existing theme layer and
  standard Icon styling merge order.

### Performance and resources

- **PR1 — No new work.** The additive target performs no measurement, listener,
  observer, state update, or additional render pass.

## Accessibility contract

The upload affordance remains decorative. The existing focusable file-selection
trigger, label, description, required/invalid state, disabled explanation, and
selection announcements remain unchanged.

## Design relationships

| Anatomy or state | Design requirement                                                                  | Representation authority                 | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- | -------------- | ------------------ |
| Drop zone        | Presents the visible file-selection surface in input or dropzone form.              | Current source and public docs           | Prominent      | FR1                |
| Upload icon      | Hints at the upload action and changes default size with the selected mode.         | Current source and owner-approved target | Supporting     | FR2, FR3, FR4      |
| Shared feedback  | Uses Field, FieldStatus, and Spinner for labels, validation, and loading treatment. | Current shared composition               | Supporting     | FR5                |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Label": {
    "delegatesTo": {"owner": "component:Field", "target": "field-label"}
  },
  "Description": {
    "none": {
      "reason": "unsettled: No current public target reaches the stable Description; future exposure still needs an owner decision"
    }
  },
  "Drop zone": {"target": "file-input"},
  "Upload icon": {"target": "file-input-icon"},
  "Placeholder": {"inherits": "file-input"},
  "File name display": {"inherits": "file-input"},
  "Clear button": {
    "delegatesTo": {
      "owner": "component:Field",
      "target": "input-clear-button"
    }
  },
  "Spinner": {
    "delegatesTo": {"owner": "component:Spinner", "target": "spinner"}
  },
  "Status message": {
    "delegatesTo": {
      "owner": "component:FieldStatus",
      "target": "field-status"
    }
  }
}
```

The `file-input-icon` disposition records the approved target state. Icon still
owns the general `icon` target and base glyph semantics; FileInput's narrower
target owns only this stable upload position and its existing mode distinction.

## Family and system relationships

- `family:input-fields` owns shared labelled-field and validation behavior.
- `architecture:component-theming-surface` owns target qualification, anatomy
  mapping, and the requirement that public targets sit on stable painted parts.
- Field, FieldStatus, Icon, and Spinner retain their existing public target
  contracts when composed by FileInput.

## Verification map

| Contract            | Verification                                                      | Representative states                              | Mutation or failure expectation                                                                             | Audit section             |
| ------------------- | ----------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------- |
| FR1, FR2            | `FileInput.test.tsx` rendering and target suites                  | Input/dropzone; empty/selected/loading             | Moving the root target or changing when/at what size the affordance renders breaks focused assertions.      | `audit:FileInput/theming` |
| FR3, FR4, FR5       | `FileInput.test.tsx`, `themingTargets.test.ts`, probe-theme check | Both modes and same-element Icon target            | Missing the target, reflecting the wrong mode, or moving it off the glyph fails source/docs/probe coverage. | `audit:FileInput/theming` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                     | Nine anatomy entries and two locally owned targets | Missing, extra, prefixed, stale, or unclaimed current mappings fail validation.                             | `audit:FileInput/anatomy` |

## Decision log

### DEC-1 — Upload icon is stable FileInput theme anatomy

**Reference:** `component:FileInput/DEC-1`
**Decider:** cixzhang, 2026-09-14

The upload icon is a stable, consumer-recognizable FileInput affordance whose
mode-dependent placement and default size belong to FileInput. It receives the
`file-input-icon` target on the same Icon element that paints the glyph, while
Icon retains its general target and base glyph semantics.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, implementation
steps, or shared-component contracts. It links to their owners.
