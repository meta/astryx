---
schema_version: 3
template_version: 4
kind: component
id: component:DateRangeInput
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-14
owners: [cixzhang]
review_triggers: [theming]
verified_by:
  [
    packages/core/src/DateRangeInput/DateRangeInput.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:input-fields, family:overlay-dismissal]
design_specs: []
architecture: [architecture:component-theming-surface]
contributing: []
system_specs: []
---

# DateRangeInput component contract

## Intent

DateRangeInput presents one controlled date range through a labeled field surface.
Its trigger opens a Calendar-backed Popover and may include a list of quick-select
presets beside that calendar.

## Compatibility and migration

- Released default preserved: `yes`; canonical DateRangeInput behavior is unchanged
- 0.7.0 removes the `date-range-input-clear-icon` alias; the shared clear glyph
  remains available through `input-clear-icon`
- The preset constraint correction remains unchanged
- Controlled/uncontrolled behavior: unchanged; DateRangeInput remains controlled
- Migration decision: replace the removed theme key and CSS class with
  `input-clear-icon` and `.astryx-input-clear-icon`, or run
  `astryx upgrade --from 0.6.3 --apply --path .`

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The composite date-range field surface and its range-display trigger.
- The optional preset list, each preset action, and reflection of a preset's current
  and disabled states.
- Converting a selected Calendar range or preset into `onChange` and
  `changeAction` output.

**Does not own / non-goals**

- Label, description, and status presentation — owned by `component:Field` and
  `component:FieldStatus`.
- Calendar-grid rendering and date-cell interaction — owned by
  `component:Calendar`.
- Layer hosting and dismissal — owned by `component:Popover` and
  `family:overlay-dismissal`.
- Shared clear-button presentation — owned by `component:Field`.

## Public concepts

No public prop or value domain is added. This contract records the existing
preset-list anatomy and its additive theming surface.

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                             | Basis                                                     | Review state               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------- |
| FR1 | DateRangeInput MUST present the controlled `value` and emit range changes without maintaining a competing selected range.                                                                                                                                                                       | Current source, docs, and focused tests                   | Verified current behavior  |
| FR2 | When presets are present, each preset remains an independent button in one labeled group; the applied preset reflects current state and a preset whose endpoint violates `min`, `max`, or `dateConstraints`, or whose range violates `minRangeSpan` or `maxRangeSpan`, reflects disabled state. | Current source, accessibility comments, and focused tests | Verified current behavior  |
| FR3 | The preset group and each preset button expose stable theme targets; selected and disabled are states of the preset-button target rather than separate targets.                                                                                                                                 | `architecture:component-theming-surface`; #5417 demand    | Approved additive contract |
| FR4 | Adding theme targets MUST NOT change the Popover, Calendar, button, focus, or selection semantics those elements already own.                                                                                                                                                                   | Composition boundary and compatibility goal               | Approved additive contract |

### Allowed variation

- **AV1 — Preset content.** A caller may omit presets or provide any number of
  labeled ranges.
- **AV2 — Calendar layout.** Calendar month count, date constraints, and range
  bounds may vary without changing preset target identity.
- **AV3 — Theme output.** Themes may restyle the preset group and buttons while
  the component's button semantics and state remain unchanged.

### Representative states

| State             | Required invariant                                                                                                                                    | Allowed variation       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| No presets        | No preset group or preset-button target renders.                                                                                                      | Calendar configuration  |
| Presets, no match | Every button carries the preset target with no selected state.                                                                                        | Preset count and labels |
| Applied preset    | The matching button carries `aria-current="true"` and the target's selected state.                                                                    | Selected range          |
| Disabled preset   | A preset that violates an endpoint date constraint or a range-span constraint is disabled per `spec:AST-085` and carries the target's disabled state. | Constraint source       |

### Transformation and precedence order

- **ORD1 — Preset state.** Resolve each preset's range once, compare it with the
  controlled value, evaluate `min`, `max`, and `dateConstraints` against both
  endpoints, evaluate `minRangeSpan` and `maxRangeSpan` against the full range,
  then reflect selected and disabled state on the same preset-button target.
- **ORD2 — Preset activation.** An enabled preset emits the already-resolved range;
  activation does not resolve the preset again.

Endpoint constraints match Calendar selection: they apply to the preset's start
and end, not every date between them.

### Performance and resources

No new performance or resource constraint is introduced.

## Accessibility contract

- **AR1 — Preset semantics.** Presets remain native buttons in one labeled group,
  navigated independently by Tab.
- **AR2 — Current state.** The applied preset remains exposed with
  `aria-current="true"`; theme state reflection is additive.
- **AR3 — Disabled state.** A preset that violates an endpoint date constraint or
  a range-span constraint is disabled and stays focusable (`spec:AST-085`); theme
  state reflection does not replace that behavior.

## Design relationships

| Anatomy or state | Design requirement                                              | Representation authority              | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------------------- | ------------------------------------- | -------------- | ------------------ |
| Field surface    | Presents one coherent input boundary.                           | Current source and input-field family | Prominent      | FR1                |
| Calendar popover | Provides range selection without changing field ownership.      | Popover and Calendar components       | Prominent      | FR1, FR4           |
| Preset sidebar   | Groups optional shortcuts beside the calendar.                  | Current source and public docs        | Supporting     | FR2, FR3           |
| Preset button    | Presents one quick-select range and its current/disabled state. | Current source and public docs        | Supporting     | FR2–FR4, AR1–AR3   |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Label": {
    "delegatesTo": {"owner": "component:Field", "target": "field-label"}
  },
  "Field surface": {"target": "date-range-input"},
  "Trigger button": {
    "none": {
      "reason": "unsettled: The composite field surface has a target, but the inner range-display button has no separate current target."
    }
  },
  "Calendar icon": {"target": "date-range-input-toggle-icon"},
  "Calendar popover": {
    "delegatesTo": {"owner": "component:Popover", "target": "popover"}
  },
  "Preset sidebar": {"target": "date-range-input-presets"},
  "Preset button": {"target": "date-range-input-preset"},
  "Clear button": {
    "delegatesTo": {"owner": "component:Field", "target": "input-clear-button"}
  },
  "Status message": {
    "delegatesTo": {"owner": "component:FieldStatus", "target": "field-status"}
  }
}
```

## Family and system relationships

- `family:input-fields` owns field sizing, status placement, loading, disabled
  reasons, and end-control geometry.
- `family:overlay-dismissal` owns the Popover dismissal stack.
- `architecture:component-theming-surface` owns target admission, state
  reflection, and anatomy mapping.

## Verification map

| Contract            | Verification                                                                      | Representative states                                                  | Mutation or failure expectation                                             | Audit section                  |
| ------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------ |
| FR1, FR2, AR1–AR3   | `DateRangeInput.test.tsx`; disabled-preset focusability (AR3) pending conformance | no match, applied preset, endpoint-invalid preset, span-invalid preset | Semantics or state attributes disappear                                     | `audit:DateRangeInput/presets` |
| FR3, FR4            | `DateRangeInput.test.tsx`, `themingTargets.test.ts`, generated probe theme        | group target, selected button, disabled button                         | Target class/state is missing, undocumented, or placed on the wrong element | `audit:DateRangeInput/theming` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                     | all documented anatomy                                                 | Target ownership or anatomy names drift                                     | `audit:DateRangeInput/theming` |

## Decision log

### DEC-1 — Preset group and buttons are public theme anatomy

**Reference:** `component:DateRangeInput/DEC-1`
**Decider:** cixzhang, 2026-09-14

The optional preset sidebar and each quick-select button are stable,
consumer-recognizable parts. `date-range-input-presets` belongs on the group
that owns sidebar presentation; `date-range-input-preset` belongs on each
button, with selected and disabled reflected as states rather than separate
targets. The target additions preserve default visuals and button semantics;
preset constraint enforcement follows FR2 and ORD1–ORD2.

## Open questions

- **OQ1 — Should the inner range-display trigger receive its own target, or remain
  represented only by the composite field surface?** (`human-api`)

## Content boundary

This file does not duplicate the consumer prop table, usage examples, Calendar or
Popover contracts, current audit results, or downstream theme implementation.
