---
schema_version: 3
template_version: 7
kind: component
id: component:FieldLabel
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Field/FieldLabel.test.tsx,
    packages/core/src/FormLayout/FormLayout.test.tsx,
    packages/core/src/Field/__tests__/FieldLabelAudit.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    packages/core/src/docPropReferences.test.ts,
    packages/core/src/docPropLiterals.test.ts,
    apps/storybook/rtl-audit/verified-not-applicable.json,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:component-test-sufficiency,
  ]
contributing: []
system_specs: [spec:AST-020/FR1]
---

# FieldLabel component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `FieldLabel` renders a visible or visually hidden label group for one control or a caller-labelled group, with optional description, optionality indicator, icon, tooltip, label-element BaseProps, and label-element ref.                  |
| Behavior                | Single-control mode uses a native label; group mode uses a labelled span. A description adds a wrapper div, while caller props and ref stay on the inner label element. Description clicks forward only to one associated control.          |
| End-user impact         | People can identify a control or group, hear supporting text separately from its name, and activate eligible controls from the complete visible label area. The current tooltip remains unavailable to keyboard and screen-reader users.    |
| Builder impact          | Builders provide stable control and description IDs, select group mode when labelling a composite, and wire `aria-labelledby` or `aria-describedby` on the controlled surface.                                                              |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Group mode renders a span while public types promise label props and ref, and the tooltip icon exposes its content only to a pointer; both are listed under Current-state impact. |
| Review checks           | Reject a lost native/group association, nested description in the accessible name, forwarded clicks from group or interactive description content, dropped label-element props/ref, hidden tooltip content, or undocumented public prop.    |
| Governing rules         | Established public interface; HTML label semantics; WCAG 2.2 SC 2.1.1, SC 4.1.2; `architecture:public-component-api/INV1,INV5–INV9,INV12`; `architecture:component-theming-surface/INV3–INV7`; `spec:AST-020/FR1`.                          |

This table is a review projection; the body below is authoritative.

## Intent

`FieldLabel` supplies the shared label, description, optionality, icon, and tooltip presentation used by Field and labeled controls such as CheckboxInput and Switch. It owns the label group only; the associated control or group owns value and interaction behavior.

## Compatibility and migration

- Released default preserved: yes.
- Compatibility class: records shipped behavior; no public prop, default, export, or DOM change.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none; the ref typing is OQ1.

## Ownership boundary

**Owns**

- Native single-control and non-label group-label element selection.
- Visible and visually hidden label and description presentation.
- Optional/required exception indicators from FormLayout optionality context.
- Safe description-click forwarding for one associated control.
- The `field-label` theme target and composition of caller props, styles, and ref on the label element.
- Whether the optional tooltip trigger is reachable and named for every input modality and assistive-technology path.

**Does not own / non-goals**

- The associated control or group's value, disabled semantics, focus model, keyboard behavior, and ARIA wiring beyond the label's own IDs.
- The caller's layout around the label group.
- Tooltip surface behavior and icon rendering, which delegate to Tooltip and `component:Icon`; FieldLabel still owns whether its chosen trigger exposes that content.

## Public concepts

| Concept                | Closed values or states                         | Meaning                                                                                   | Availability by variant/orientation/state | Default        | Owner                  | Stability | Invalid-value behavior                                                                                                               |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------- | -------------- | ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| label mode             | single control; group                           | Chooses a native `<label htmlFor>` or a `<span>` referenced through `aria-labelledby`.    | All uses.                                 | single control | `component:FieldLabel` | released  | Boolean-constrained; see OQ1 for root/ref typing.                                                                                    |
| label visibility       | visible; visually hidden                        | Keeps label and description accessible while removing their layout space when hidden.     | Both label modes.                         | visible        | `component:FieldLabel` | released  | Boolean-constrained.                                                                                                                 |
| optionality marker     | none; optional; required                        | Shows the localized exception to FormLayout's form-level optionality default.             | Visible and hidden labels.                | none           | `component:FieldLabel` | released  | When both booleans are true, optional wins visibly, unless FormLayout's default is optional, which suppresses it and shows required. |
| leading icon           | absent; icon type; rendered node                | Adds visual content before the label text.                                                | Both label modes.                         | absent         | `component:FieldLabel` | released  | Rendered through the shared icon slot.                                                                                               |
| explanatory tooltip    | absent; localized string                        | Adds the shared info-icon anchor and tooltip surface after the label.                     | Both label modes.                         | absent         | `component:FieldLabel` | released  | The anchor is pointer-only (FR8 gap).                                                                                                |
| supporting description | absent; rendered node with optional explicit ID | Keeps supporting content separate from the accessible name and available for description. | Both label modes.                         | absent         | `component:FieldLabel` | released  | Missing ID leaves association to the caller.                                                                                         |
| description activation | forwarding; non-forwarding                      | For one control, noninteractive description clicks mirror native-label activation.        | Single mode only.                         | forwarding     | `component:FieldLabel` | released  | Group mode and interactive descendants do not forward.                                                                               |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                 | Basis                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| FR1 | Single-control mode renders `<label htmlFor={inputID}>`; group mode renders a non-label element with `labelID` for caller-owned `aria-labelledby`.                                                                                                                                                        | Established public interface; HTML and ARIA semantics                |
| FR2 | Visible and hidden labels retain the label text; hidden label and description boxes remain in the accessibility tree and leave no layout slot.                                                                                                                                                            | Established public interface                                         |
| FR3 | Descriptions remain siblings of the label so they do not enter the control's accessible name. Noninteractive description clicks forward to one eligible control; group labels and interactive descendants do not forward activation.                                                                      | Established public interface; native label behavior                  |
| FR4 | FormLayout optionality suppresses the matching visible marker; without a form default, the requested marker is localized and shown. When both flags are true, optional wins, except inside a FormLayout whose default is optional, where the optional marker is suppressed and the required marker shows. | Established public interface and current tests                       |
| FR5 | Label icons, tooltip anchors, required/optional text, and description content preserve source order. The label element uses a horizontal flex row; the optional label/description wrapper uses block flow. All component-owned spacing is logical or direction-neutral.                                   | Established public interface and source observation                  |
| FR6 | Accepted data, ARIA, DOM, class, style, event, and `xstyle` inputs compose on the label element without replacing the component-owned target or association. When a description renders, the outer wrapper is layout-only and caller props stay on the inner label element.                               | `architecture:public-component-api/INV5–INV7`                        |
| FR7 | The public ref and label-element props MUST describe the element FieldLabel renders in each mode; which root element and public type group mode uses is OQ1. Implementation gap: group mode renders a `<span>` while the public BaseProps and ref types are fixed to `HTMLLabelElement`.                  | `architecture:public-component-api/INV8,INV9`; current runtime/types |
| FR8 | The optional tooltip's explanatory content MUST be reachable by keyboard (WCAG 2.2 SC 2.1.1) and its trigger MUST have an accessible name and role (WCAG 2.2 SC 4.1.2). Implementation gap: it anchors to an anonymous, nonfocusable info icon, so the content is pointer-only.                           | WCAG 2.2 SC 2.1.1, SC 4.1.2; `spec:AST-020/FR1`                      |

### Allowed variation

- **AV1 — Parent layout.** Field, CheckboxInput, Switch, and direct consumers may arrange the label group differently without changing its local semantics.
- **AV2 — Label content.** Icon, tooltip, optionality text, and description content may be absent independently.
- **AV3 — Control kind.** Description activation follows the associated native or custom control's supported click/focus behavior.

### Representative states

| State                 | Required invariant                                                                                                                                                       | Allowed variation                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| single label          | Native label association reaches the one control.                                                                                                                        | Visible or visually hidden.                      |
| group label           | Label element is not a literal label and is referenceable by `labelID`.                                                                                                  | Caller owns group role and `aria-labelledby`.    |
| description           | Supporting content remains outside the label and may expose `descriptionID`.                                                                                             | Text or structured content.                      |
| optional or required  | One localized exception marker follows label text.                                                                                                                       | Suppressed when it matches FormLayout's default. |
| disabled presentation | Label uses disabled text treatment and no pointer cursor.                                                                                                                | Associated control owns actual disabled state.   |
| icon and tooltip      | Shared Icon and Tooltip render their owned paint; the tooltip trigger is keyboard-reachable and named (FR8). Implementation gap: the anchor is nonfocusable and unnamed. | Either slot may be absent.                       |

### Transformation and precedence order

- **ORD1 — Optionality.** The FormLayout default suppresses its matching marker first; then optional wins when both local booleans are true.
- **ORD2 — Label-element composition.** Component target and base styles apply before caller `xstyle`, class, and inline style composition on the label element; association and label-element choice remain component-owned. An optional description adds a layout wrapper without retargeting those inputs.

### Performance and resources

- **PR1 — No retained resource.** FieldLabel owns no global listener, observer, timer, or external store. Description activation reuses the shared input-container hook with local refs, and a `labelTooltip` brings the shared Tooltip's listeners and layer.

## Accessibility contract

- **AR1 — Label association.** Single controls use native label association; grouped controls use a caller-wired labelled span and never a misleading literal label.
- **AR2 — Description separation.** Description content stays outside the label so it is not duplicated in the accessible name and exposes an ID for caller-owned `aria-describedby`.
- **AR3 — Hidden labels.** Visually hidden label and description content remain programmatically available.
- **AR4 — Activation boundary.** Description activation never hijacks interactive descendants and never forwards from a group label to one control.
- **AR5 — Tooltip reachability.** Tooltip content MUST be reachable by keyboard
  (WCAG 2.2 SC 2.1.1) through a named trigger (SC 4.1.2) (FR8). Implementation gap: the anonymous, nonfocusable anchor exposes it only to a pointer.

## Design relationships

No current repository design record governs component-local visual tuning. The implementation uses shared semantic type, color, spacing, and disabled tokens; rendered evidence records the resulting states without turning them into policy.

## Family and system relationships

- `architecture:public-component-api` owns exports, label-element prop composition, ref accuracy, and released API compatibility.
- `architecture:component-theming-surface` owns the anatomy-to-target disposition and target composition.
- `architecture:component-test-sufficiency` owns bounded, mutation-sensitive evidence for each critical established public seam.

## Verification map

| Contract          | Verification                                                                                                                                                                     | Representative states                                     | Mutation or failure expectation                                                                                                                                                                                                                          | Audit section                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| FR1–FR3, AR1–AR4  | `FieldLabel.test.tsx` association, ref, and description-forwarding cases; `FieldLabelAudit.a11y.chromium.spec.ts` default, custom-theme, RTL, and narrow cases in light and dark | Single, group, description, interactive description child | A wrong label element, lost association, nested description, or forwarded group or interactive click fails. Evidence gap: no test asserts the hidden label and description leave no layout slot.                                                         | `audit:FieldLabel/accessibility` |
| FR4, ORD1         | `FieldLabel.test.tsx` optional, required, both-set, and i18n cases; `FormLayout.test.tsx` default-optionality cases through Field                                                | Optional, required, both, localized                       | A wrong localized marker, required winning over optional, or a marker that restates the form default fails.                                                                                                                                              | `audit:FieldLabel/behavior`      |
| FR5               | `FieldLabel.test.tsx` label-icon, tooltip, and tooltip-with-optional cases                                                                                                       | Icon, tooltip, optionality                                | A missing icon or tooltip anchor fails. Evidence gap: no test asserts source order, the flex row, or logical spacing.                                                                                                                                    | `audit:FieldLabel/layout`        |
| FR6, ORD2         | `FieldLabel.test.tsx` ref, layout-item, and label-target cases; `themingTargets.test.ts`                                                                                         | Ref; composed target; with a description wrapper          | A dropped ref or a lost `field-label` target fails; a rendered class absent from the documented targets fails. Evidence gap: no test asserts caller class, style, `xstyle`, data, and event props on the inner label element with a description wrapper. | `audit:FieldLabel/api`           |
| FR7               | Evidence gap: no type test pins the public ref and props against the rendered group span                                                                                         | —                                                         | —                                                                                                                                                                                                                                                        | `audit:FieldLabel/api`           |
| FR8, AR5          | `FieldLabelAudit.a11y.chromium.spec.ts` tooltip-anchor count                                                                                                                     | Tooltip present                                           | The audit records the one anonymous, nonfocusable anchor; it changes when the FR8 gap closes.                                                                                                                                                            | `audit:FieldLabel/accessibility` |
| PR1               | Evidence gap: no test asserts the absence of retained resources                                                                                                                  | —                                                         | —                                                                                                                                                                                                                                                        | `audit:FieldLabel/code-health`   |
| Documentation     | `docPropLiterals.test.ts`; `docPropReferences.test.ts`                                                                                                                           | Documented props and defaults                             | A documented literal or prop reference that drifts from the source type fails.                                                                                                                                                                           | `audit:FieldLabel/docs`          |
| RTL applicability | `apps/storybook/rtl-audit/verified-not-applicable.json` entry for `core/FieldLabel`                                                                                              | Checked-in FieldLabel stories                             | A story that gains directional placement or behavior makes the not-applicable entry stale.                                                                                                                                                               | `audit:FieldLabel/i18n-rtl`      |

## Current-state impact

- **Group-mode typing (FR7).** Group mode renders a `<span>` while the public
  props and ref are typed for `HTMLLabelElement`, against
  `architecture:public-component-api` INV8 and INV9; the fix is OQ1.
- **Tooltip reachability (FR8, AR5).** The label tooltip is pointer-only,
  against WCAG 2.2 SC 2.1.1 and 4.1.2.

## Decision log

No component-local decision. The label-element and ref typing is OQ1.

## Open questions

- **OQ1 — Should `isGroupLabel` expose a discriminated span-root BaseProps/ref contract, or should FieldLabel use one root element whose public type is stable in both modes?** (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
