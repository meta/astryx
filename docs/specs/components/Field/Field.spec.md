---
schema_version: 3
template_version: 7
kind: component
id: component:Field
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Field/Field.test.tsx,
    packages/core/src/FormLayout/FormLayout.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    packages/core/src/docPropLiterals.test.ts,
    packages/core/src/docPropReferences.test.ts,
    apps/storybook/rtl-audit/verified-not-applicable.json,
  ]
modules: []
families: [family:input-fields]
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:component-test-sufficiency,
  ]
contributing: []
system_specs:
  [spec:AST-027/FR1, spec:AST-027/FR2, spec:AST-027/FR3, spec:AST-027/FR11]
---

# Field component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Field` wraps one caller-owned control with a label, optional description and status, optionality indicators, an explicit width, and root `BaseProps`; it also consumes FormLayout's horizontal-label mode.                                                     |
| Behavior                | Single controls use a native label association; groups use a labelled span. Status messages receive stable IDs and use persistent live regions. Horizontal-label mode exposes one protected `data-layout` theme axis.                                           |
| End-user impact         | People can identify a custom control, hear its description and changing status, and keep label/control/status relationships together across ordinary and horizontal form layouts.                                                                               |
| Builder impact          | Builders provide the control and its ID, wire descriptions/status IDs to that control, choose group semantics when needed, and use a status placement that is safe for the wrapped surface.                                                                     |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. The default `statusVariant="attached"` for arbitrary children conflicts with `family:input-fields/FR8`; listed under Current-state impact, with the migration open (OQ1).                             |
| Review checks           | Reject a lost label/group association, dropped root props, caller replacement of `data-layout`, duplicate/missing status announcement, escaped local z-index, undocumented public literals, or a claim that all custom controls safely support attached status. |
| Governing rules         | Established public `Field` interface; `family:input-fields` shared ownership and FR8; `architecture:public-component-api/INV5–INV8`; `spec:AST-027/FR1–FR3`; HTML label and ARIA naming/description semantics.                                                  |

This table is a review projection; the body below is authoritative.

## Intent

`Field` supplies shared label, description, status, width, and layout chrome for a native, custom, or third-party control that does not already own an Astryx field shell. The caller continues to own the control's value, interaction model, and control-specific accessibility semantics.

## Compatibility and migration

- Released default preserved: yes; `statusVariant` still defaults to `attached` in the current implementation.
- Compatibility class: records shipped behavior; no public prop, default, export, or DOM change.
- Controlled/uncontrolled behavior: caller-owned and unchanged.
- Migration decision: none; resolving OQ1 requires a separate compatibility decision.

## Ownership boundary

**Owns**

- The root field box, explicit width, local stacking boundary, and composition order.
- Label and description placement around the caller-owned control.
- Single-control versus grouped-label semantics.
- Status-message placement and persistent live-region announcement.
- The FormLayout horizontal-label projection.

**Does not own / non-goals**

- The wrapped control's value, focus model, keyboard behavior, disabled behavior, or event semantics — owned by the caller or wrapped component.
- Applying `aria-describedby` to the wrapped control — the caller supplies the control and wires the generated or explicit IDs.
- The visual and semantic contract of `FieldLabel`, `FieldStatus`, `Tooltip`, or caller-owned children — owned by those components.
- Input-family member APIs and control-box part props — owned by `family:input-fields` and each member.

## Public concepts

| Concept                | Closed values or states                           | Meaning                                                                                          | Availability by variant/orientation/state                              | Default                        | Owner                 | Stability                 | Invalid-value behavior                                                                                                  |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------ | --------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| label mode             | single control; group                             | Chooses a native `<label htmlFor>` or a `<span>` named through `aria-labelledby`.                | All layouts.                                                           | single control                 | `component:Field`     | released                  | Type-constrained                                                                                                        |
| label visibility       | visible; visually hidden                          | Hides label and description visually while preserving them for assistive technology.             | All layouts.                                                           | visible                        | `component:Field`     | released                  | Type-constrained                                                                                                        |
| optionality marker     | none; optional; required                          | Shows the localized exception to FormLayout's optionality default.                               | Label presentation.                                                    | none                           | `component:Field`     | released                  | Both set warns; optional wins visibly, unless FormLayout's default is optional, which suppresses it and shows required. |
| status placement       | `attached`; `detached`; `tooltip`                 | Places a status box behind the control, below it, or leaves visible tooltip affordance to input. | Message required for a rendered box; tooltip still announces messages. | `attached` (see OQ1)           | `family:input-fields` | released; conformance gap | Type-constrained                                                                                                        |
| width                  | absent; number; CSS size string                   | Sizes the complete ordinary field box.                                                           | Ordinary box layout; horizontal-label mode uses `display: contents`.   | containing layout              | `component:Field`     | released                  | Type-constrained                                                                                                        |
| field layout           | ordinary box; `horizontal-labels` from FormLayout | Stacks content or projects label and input group into the parent grid.                           | Resolved from `FormLayoutContext`.                                     | ordinary box                   | `component:Field`     | released                  | Context-constrained                                                                                                     |
| description/status IDs | explicit; generated from `inputID`; absent        | Names stable description and message elements for caller-owned `aria-describedby` wiring.        | Generated only when the corresponding text is present.                 | generated when text is present | `component:Field`     | released                  | Empty text omits output                                                                                                 |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| FR1 | A single-control label renders as `<label htmlFor={inputID}>`; a group label renders as a non-label element with `labelID` for caller-owned `aria-labelledby`.                                                                                                                                                                                                                                                                                          | Established public interface; HTML and ARIA semantics                  |
| FR2 | Visually hidden labels and descriptions remain in the DOM and out of layout flow.                                                                                                                                                                                                                                                                                                                                                                       | Established public interface and accessibility behavior                |
| FR3 | Description and status IDs use explicit values when supplied and otherwise resolve to `${inputID}-desc` and `${inputID}-status` only when text exists.                                                                                                                                                                                                                                                                                                  | Established public interface                                           |
| FR4 | Error status messages announce assertively and warning/success messages politely through persistent live regions; tooltip placement renders no `FieldStatus` box but preserves the announcement.                                                                                                                                                                                                                                                        | Existing tests; family ownership                                       |
| FR5 | Ordinary layout orders label, control, then optional status. Horizontal-label mode places the label wrapper before one description/control/status group and reflects `data-layout="horizontal-labels"`; caller props cannot replace that owned theme marker.                                                                                                                                                                                            | Established layout interface; `architecture:public-component-api/INV5` |
| FR6 | `width` applies to the ordinary root field box; it does not style the caller-owned control and has no box to target in horizontal-label mode.                                                                                                                                                                                                                                                                                                           | Established public interface; `family:input-fields` shared owner       |
| FR7 | Root ref, data/ARIA/DOM inputs, events, `xstyle`, class name, and inline style reach or compose on the root without replacing component-owned semantics.                                                                                                                                                                                                                                                                                                | `architecture:public-component-api/INV5–INV8`                          |
| FR8 | The Field root isolates every local attached-status paint relationship without assigning the root a page-level z-index.                                                                                                                                                                                                                                                                                                                                 | `spec:AST-027/FR1–FR3`, `FR11`                                         |
| FR9 | Field MUST give attached placement only to an opaque, bordered, fixed-height control with reliable size reflection; tall, wrapped, translucent, non-bordered, or otherwise ineligible controls, as custom controls normally are, use detached or component-owned placement. Implementation gap: `statusVariant` defaults to `attached` for every child, so an ineligible control receives attached placement unless the caller chooses otherwise (OQ1). | `family:input-fields/FR8`                                              |

### Allowed variation

- **AV1 — Caller-owned control.** Any control markup may occupy the slot; Field does not inspect, clone, or change it.
- **AV2 — Form arrangement.** FormLayout may choose ordinary or horizontal-label arrangement without changing label, description, status, or announcement ownership.
- **AV3 — Status surface.** Eligible controls may use attached placement; other controls use detached or a member-owned tooltip presentation.

### Representative states

| State             | Required invariant                                                             | Allowed variation                                          |
| ----------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| label only        | One associated label precedes the caller-owned control.                        | Visible or visually hidden.                                |
| description       | One description element receives the resolved ID.                              | Caller may use an explicit ID or the generated value.      |
| group             | Group label is not a literal `<label>` and is referenceable by ID.             | Caller owns the group role and `aria-labelledby`.          |
| status            | Message receives resolved ID and is announced once on its urgency channel.     | Attached/detached box or tooltip-owned visible affordance. |
| horizontal labels | Label and input group participate in the parent grid and retain `data-layout`. | Description/status may be absent.                          |
| explicit width    | Ordinary root receives the requested size and remains shrinkable.              | Number or CSS size string.                                 |

### Transformation and precedence order

- **ORD1 — Root props.** Caller DOM/data/event props are forwarded first; Field-owned visual-state reflection is applied afterward; StyleX, caller class, and caller inline style compose in the documented order.
- **ORD2 — IDs.** Explicit description/status ID wins; otherwise text presence derives an ID from `inputID`; absent text produces no ID-bearing element.
- **ORD3 — Optionality.** FormLayout default optionality suppresses the matching visible marker; if both local booleans are true, Field warns and the optional marker wins visibly, unless FormLayout's default is optional, which suppresses it so the required marker shows.

### Performance and resources

- **PR1 — No per-field global resource.** Field owns no listener, observer, timer, or external store. Status announcement delegates to the shared persistent live-region runtime, and a `labelTooltip` brings the shared Tooltip's listeners and layer.

## Accessibility contract

- **AR1 — Label association.** Single controls receive a native label association; grouped controls use caller-wired `aria-labelledby` and never a misleading literal `<label>`.
- **AR2 — Description association.** Description text remains separate from the accessible name and exposes a stable ID for caller-owned `aria-describedby`.
- **AR3 — Status announcement.** Changing status text is announced through the persistent live region, including tooltip placement where no message box renders.
- **AR4 — Hidden labels.** Visually hidden label and description text remain available to assistive technology.

## Design relationships

No current repository design record governs component-local visual tuning.
The label, description, and status use shared semantic type, color, and
spacing tokens.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Container": {"target": "field"},
  "Label": {"target": "field-label"},
  "Ordinary description": {
    "none": {
      "reason": "reachability-gap: The ordinary-layout description paints supporting text outside the field-label target and has no current public target of its own."
    }
  },
  "Horizontal-label description": {
    "delegatesTo": {"owner": "component:Text", "target": "text"}
  },
  "Control slot": {
    "none": {
      "reason": "intentional: The wrapped control is caller-owned or another Astryx component and retains its own theming surface."
    }
  },
  "Status message": {"target": "field-status"},
  "Input status icon": {"target": "input-status-icon"},
  "Input clear button": {"target": "input-clear-button"},
  "Input clear icon": {"target": "input-clear-icon"},
  "Optional/Required indicator": {"inherits": "field-label"},
  "Label tooltip trigger": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Label tooltip surface": {
    "delegatesTo": {"owner": "component:Tooltip", "target": "tooltip"}
  }
}
```

The ordinary description remains stable consumer anatomy without a Field-owned target. A visible horizontal-label description delegates to `Text/text`; when `isLabelHidden` is true, the same content delegates to `VisuallyHidden` and exposes no painted target. The label tooltip splits its visible `Icon/icon` trigger from its layer-hosted `Tooltip/tooltip` surface.

## Family and system relationships

- `family:input-fields` owns shared status-placement capability and identifies Field as the standalone label, description, status-placement, and explicit-width owner.
- `architecture:public-component-api` owns root prop, style, event, and ref composition.
- `architecture:component-theming-surface` owns anatomy qualification and target disposition.
- `architecture:component-test-sufficiency` owns mutation-sensitive evidence and bounded partitions.
- `spec:AST-027` owns the isolated local paint relationship between the control and attached status.

## Verification map

| Contract                     | Verification                                                                                                           | Representative states                                                                                | Mutation or failure expectation                                                                                                                                 | Audit section               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| FR1–FR3, ORD2, AR1, AR2, AR4 | `Field.test.tsx` label-element, group-label, hidden label and description, description-ID, and generated-ID cases      | Single control, group, visible and hidden label, explicit and generated IDs                          | A lost association, wrong element, missing hidden text, or wrong ID fails.                                                                                      | `audit:Field/accessibility` |
| FR4, AR3                     | `Field.test.tsx` announcement and tooltip-placement cases                                                              | First mount, update, repeat, error, warning, tooltip, no message                                     | A missing, duplicate, stale, or wrong-urgency announcement fails.                                                                                               | `audit:Field/accessibility` |
| FR5, FR6, ORD1               | `Field.test.tsx` horizontal-labels, width, and narrow-row cases                                                        | Ordinary and horizontal layout; string and number width; narrow row                                  | A replaceable layout marker, wrong grid grouping, or width on the inner control fails. Evidence gap: no test asserts the ordinary label, control, status order. | `audit:Field/layout`        |
| FR7                          | `Field.test.tsx` ref and horizontal-labels root-props cases                                                            | Ref; class, style, data, and event props in horizontal mode                                          | A dropped ref or caller-replaced layout marker fails. Evidence gap: no test asserts root `xstyle`, class, style, and event props in the ordinary layout.        | `audit:Field/api`           |
| ORD3                         | `Field.test.tsx` optional, required, and both-set cases; `FormLayout.test.tsx` default-optionality cases through Field | Optional; required; both; form default                                                               | A missing marker, no warning when both are set, or a marker that restates the form default fails.                                                               | `audit:Field/behavior`      |
| FR8                          | `Field.test.tsx` attached-layer and local-stacking cases                                                               | Attached, no status, custom control                                                                  | Removing isolation or ranking the root outside its parent fails.                                                                                                | `audit:Field/code-health`   |
| FR9                          | `Field.test.tsx` attached-layer case for a custom control                                                              | Custom control with an attached status                                                               | The test pins the current attached default, so it changes when the FR9 gap closes.                                                                              | `audit:Field/behavior`      |
| PR1                          | Evidence gap: no test asserts the absence of per-field global resources                                                | —                                                                                                    | —                                                                                                                                                               | `audit:Field/code-health`   |
| Theming anatomy              | `scripts/check-knowledge.mjs`; `themingTargets.test.ts`                                                                | Field root, label, description, caller control, status, shared input affordances, indicator, tooltip | Invalid dispositions, or a rendered class absent from the documented targets, fails.                                                                            | `audit:Field/theming`       |
| Documentation projection     | `docPropLiterals.test.ts`; `docPropReferences.test.ts`                                                                 | Status placements, `labelIcon`, and other documented props                                           | A documented literal or prop reference that drifts from the source type fails.                                                                                  | `audit:Field/docs`          |
| RTL applicability            | `apps/storybook/rtl-audit/verified-not-applicable.json` entry for `core/Field`                                         | Checked-in Field stories                                                                             | A story that gains directional placement or behavior makes the not-applicable entry stale.                                                                      | `audit:Field/i18n-rtl`      |

## Current-state impact

- **Attached default (FR9).** Field defaults `statusVariant` to `attached` for
  every child, against `family:input-fields/FR8`; how to migrate the default is
  OQ1.
- **Label tooltip (FieldLabel FR8).** A `labelTooltip` is reachable only by
  pointer, as `component:FieldLabel` FR8 records, against WCAG 2.2 SC 2.1.1.

## Decision log

No component-local decision. Field applies `family:input-fields` and `spec:AST-027`.

## Open questions

- **OQ1 — How should Field migrate the released `attached` default so arbitrary custom controls cannot receive a placement that `family:input-fields/FR8` says they may not safely support?** (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
