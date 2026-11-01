---
schema_version: 3
template_version: 1
kind: component
id: component:FieldStatus
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-30
owners: [cixzhang, imdreamrunner]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/FieldStatus/FieldStatus.test.tsx,
    packages/core/src/FieldStatus/__tests__/StatusMessage.a11y.test.tsx,
    packages/core/src/FieldStatus/__tests__/StatusMessage.a11y.chromium.spec.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture: [architecture:component-theming-surface]
contributing: []
system_specs: [spec:AST-009, spec:AST-020, spec:AST-021]
---

# FieldStatus component contract

## Intent

FieldStatus presents one validation message for a field or field-like control. It
owns the visible message treatment and announcement behavior for attached and
detached presentations; consumer usage remains documented in
`FieldStatus.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: additive documentation only; runtime, DOM, styling, and
  public API remain unchanged, except that delivery inside a mounted live
  container follows `spec:AST-086` FR4
- Controlled/uncontrolled behavior: not applicable
- Migration decision: direct `FieldStatus variant="tooltip"` support is rejected.
  `tooltip` remains a field-family sentinel that MUST be handled before rendering
  FieldStatus. Narrowing the currently permissive type/runtime path requires a
  separate compatibility-aware implementation change.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The attached and detached validation-message presentations.
- Routing visible messages through the persistent announcement channels.
- The detached presentation's redundant visual status glyph.

**Does not own / non-goals**

- Whether a caller renders a status message, or which control it describes —
  owned by the composing field component or product callsite.
- The bordered control's status treatment and on-field tooltip presentation —
  owned by the composing field component.
- General alerts and page-level notices — owned by the corresponding feedback
  components.

## Public concepts

| Concept      | Closed values or states       | Meaning                                            | Availability by variant/orientation/state                                                                  | Default    | Owner                   | Stability | Invalid-value behavior                                                                                                          |
| ------------ | ----------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------- | ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Status type  | `error`, `warning`, `success` | Selects the message tone and announcement channel. | All rendered presentations.                                                                                | Required   | `component:FieldStatus` | Stable    | TypeScript rejects unsupported values.                                                                                          |
| Presentation | `attached`, `detached`        | Selects the message presentation.                  | All direct FieldStatus usage. The field family's `tooltip` sentinel is handled before FieldStatus renders. | `attached` | `component:FieldStatus` | Stable.   | TypeScript rejects values absent from the extensible variant map; its current acceptance of `tooltip` is an implementation gap. |

The field family's `tooltip` status presentation suppresses FieldStatus and
surfaces the message from the control's on-field icon. `tooltip` is not a
FieldStatus presentation. The public extensible variant map currently permits a
direct `tooltip` value; that is an implementation gap, not supported behavior.

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision.

| ID  | Candidate invariant                                                                                                                                        | Basis                                               | Draft review state                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| FR1 | FieldStatus MUST render the provided message in one visible message box when mounted.                                                                      | Documented promise and current tests.               | Settled intent.                                         |
| FR2 | The attached presentation MUST render the message without a leading glyph; the detached presentation MUST render its status glyph before the message text. | Documented promise, current DOM, and current tests. | Settled intent.                                         |
| FR3 | Status type MUST select distinct error, warning, or success treatment and MUST be reflected on the message-box target.                                     | Current behavior and theming tests.                 | Settled intent.                                         |
| FR4 | The detached glyph MUST reflect status type on its own target; the target MUST be absent from attached presentation.                                       | Current behavior and target tests.                  | Settled intent.                                         |
| FR5 | The root MUST continue to forward its ref, ID, supported DOM props, and consumer styling escape hatches.                                                   | Current behavior and tests.                         | Current compatibility behavior; verify before changing. |
| FR6 | Message and status-type updates MUST update the visible output without replacing the component contract.                                                   | Current behavior and tests.                         | Current compatibility behavior; verify before changing. |
| FR7 | Direct FieldStatus usage MUST support only `attached` and `detached`; the Field family MUST consume its `tooltip` sentinel before rendering FieldStatus.   | Approved component boundary.                        | Settled intent; current type acceptance is a gap.       |

### Allowed variation

- **AV1 — Theme styling.** Theme and consumer overrides may change visual CSS
  properties through the existing targets and styling escape hatches without
  changing anatomy, ownership, or presentation behavior.
- **AV2 — Message length.** The message may wrap; the detached glyph remains
  aligned with the first text line.

### Representative states

| State            | Required invariant                                             | Allowed variation                                           |
| ---------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| Attached error   | Message box and text render; no detached glyph renders.        | Theme-controlled visual properties on `field-status`.       |
| Detached warning | Message box, leading warning glyph, then message text render.  | Theme-controlled visual properties on both current targets. |
| Detached success | Message box, leading success glyph, then message text render.  | Message length and theme-controlled visual properties.      |
| Empty message    | The root remains mounted and renders the provided empty value. | No announcement channel is created.                         |

### Transformation and precedence order

- **ORD1 — Presentation styling.** Resolve the default presentation, reflect
  status and presentation through `themeProps`, apply component styles, then
  merge `xstyle`, `className`, and inline `style` in their established order.
- **ORD2 — Detached content.** Render the decorative status glyph before the
  message text, using the same status-to-glyph mapping as field controls.

### Performance and resources

- **PR1 — Channel-update work.** A message change schedules only the persistent
  live-region update; FieldStatus owns no global event listeners, observers, or
  measurements.

## Accessibility contract

- **AR1 — Programmatic announcement channel.** Errors MUST update the persistent
  assertive region; warnings and successes MUST update the persistent polite
  region, including on first mount and when message or type changes, without
  moving focus. Inside a mounted live container, `spec:AST-086` FR4 applies.
- **AR5 — Assistive-technology output.** Claims about whether, when, or how the
  message is spoken or presented in braille are recommended real-AT follow-up
  under `spec:AST-009`, not a merge or release requirement; DOM and
  accessibility-tree checks prove programmatic exposure and routing.
- **AR2 — Visible description.** The rendered message box MUST remain available
  to assistive technology for `aria-describedby` association and MUST NOT become
  its own newly mounted live region.
- **AR3 — Non-color cue.** Detached status MUST include a leading status glyph so
  status is not conveyed only by color or position.
- **AR4 — Redundant glyph.** The detached glyph MUST remain hidden from assistive
  technology because the visible message already conveys the status in text;
  announcement output remains owned by AR5.

## Design relationships

| Anatomy or state | Design requirement                                         | Representation authority                        | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------- | ----------------------------------------------- | -------------- | ------------------ |
| Message box      | Carries the visible validation treatment.                  | Current behavior and approved component intent. | Supporting     | FR1, FR3           |
| Detached icon    | Adds a non-color status cue only in detached presentation. | Current behavior and approved component intent. | Supporting     | FR2, FR4, AR3      |
| Message text     | Communicates the validation result in words.               | Current behavior and approved component intent. | Prominent      | FR1, AR1, AR2, AR5 |

Current behavior renders the detached icon before message text. The intended
public theming ownership is the exact map below; it does not add a target or
change either presentation.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Message box": {"target": "field-status"},
  "Detached icon": {"target": "field-status-icon"},
  "Message text": {"inherits": "field-status"}
}
```

## Family and system relationships

- `architecture:component-theming-surface` owns the qualification and validation
  rules for the two targets and inherited message text.
- Field-like controls compose FieldStatus but continue to own control rendering,
  status placement decisions, and association with the control.

## Verification map

| Contract            | Verification                                                            | Representative states                                         | Mutation or failure expectation                                                                                                       | Audit section                     |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| FR1, FR2, AR3, AR4  | `FieldStatus.test.tsx` rendering and detached-icon suites               | Attached and detached; all status types                       | Removing or reordering presentation parts fails DOM and accessibility assertions.                                                     | `audit:FieldStatus/anatomy`       |
| FR3, FR4            | `FieldStatus.test.tsx` theme target suites                              | Attached/detached; error/warning/success                      | Removing a target or status reflection fails class/data-attribute assertions.                                                         | `audit:FieldStatus/theming`       |
| FR5, FR6            | `FieldStatus.test.tsx` forwarding and update suites                     | Initial render and rerender                                   | Breaking the released root or update behavior fails compatibility assertions.                                                         | `audit:FieldStatus/behavior`      |
| AR1                 | `StatusMessage.a11y.test.tsx` and `StatusMessage.a11y.chromium.spec.ts` | Error, warning, and success; post-mount message replacement   | Removing the persistent channel, changing its role/urgency, or dropping a post-mount update fails the shared status-message contract. | `audit:FieldStatus/accessibility` |
| AR1                 | `FieldStatus.test.tsx` channel-routing suite                            | First non-empty mount; same-instance message and type changes | Breaking FieldStatus's first-use hook call or severity rerouting fails component-specific assertions.                                 | `audit:FieldStatus/accessibility` |
| AR5                 | Recommended real-AT follow-up under `spec:AST-009`                      | First mount; message replacement; type/urgency change         | Spoken and braille output stay unverified until a real-AT receipt exists; this does not block merge or release.                       | `audit:FieldStatus/accessibility` |
| AR2                 | `FieldStatus.test.tsx`                                                  | Attached/detached visible message and empty message           | The visible description becomes a second live region or is hidden from assistive technology.                                          | `audit:FieldStatus/accessibility` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                           | Consumer anatomy and current targets                          | Missing, extra, duplicated, prefixed, or stale mappings fail repository validation.                                                   | `audit:FieldStatus/theming`       |

## Decision log

### DEC-1 — Presentation-specific anatomy remains explicit

**Reference:** `component:FieldStatus/DEC-1`
**Decider:** cixzhang, 2026-08-30

The detached icon is a separate anatomy part because only detached presentation
renders it and it owns a target distinct from the message box. Message text
inherits the message-box target rather than creating a redundant child target.

Rejected: collapsing the glyph into a generic message row, which would hide its
presentation condition and distinct theming owner.

### DEC-2 — `tooltip` is not a FieldStatus presentation

**Reference:** `component:FieldStatus/DEC-2`
**Decider:** cixzhang, 2026-08-30

Direct FieldStatus usage supports only `attached` and `detached`. The Field
family may use `tooltip` as an internal presentation sentinel, but it MUST
consume that value before rendering FieldStatus and surface the message through
the control's on-field status treatment instead.

Rejected: defining direct `FieldStatus variant="tooltip"` rendering semantics.
That would expose a field-composition mechanism as a third FieldStatus
presentation and preserve currently unintentional output.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop examples, current audit results,
implementation steps, or family/system rules. It links to their owners.
