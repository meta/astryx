---
schema_version: 3
template_version: 7
kind: component
id: component:Divider
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility, testing]
verified_by:
  [
    .github/visual-baseline/manifest.json,
    packages/core/src/Divider/Divider.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/Divider.stories.tsx,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:container-padding,
    architecture:component-test-sufficiency,
  ]
contributing: []
system_specs: [spec:AST-009, spec:AST-020]
---

# Divider component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `orientation`, `label`, theme-extensible `variant`, `isFullBleed`, `BaseProps<HTMLDivElement>`, and a root `ref`.                                                                                                            |
| Behavior                | The separator renders one rule without a label and two rules around a renderable label; full bleed consumes inherited logical container inset.                                                                               |
| End-user impact         | People perceive a named separator across horizontal, vertical, labelled, full-bleed, narrow, and RTL compositions.                                                                                                           |
| Builder impact          | None; the record describes shipped behavior. Numeric zero is a valid label; booleans and empty strings leave one continuous unnamed rule.                                                                                    |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. Two implementation gaps are listed under Current-state impact.                                                                                    |
| Review checks           | Reject missing numeric labels, physical-edge bleed, dropped root inputs, or a target or axis that disagrees with the rendered separator.                                                                                     |
| Governing rules         | `architecture:public-component-api/INV1,INV5–INV9`; `architecture:component-theming-surface/INV3–INV7,INV14`; `architecture:container-padding/INV1,INV3,INV7–INV10`; WCAG 2.2 SC 1.3.1 and 4.1.2 through `spec:AST-020/FR1`. |

This table is a review projection; the body below is authoritative.

## Intent

Divider provides a programmatic and visual separator between caller-owned content
regions. It owns orientation, line weight, optional label placement and naming,
logical full-bleed geometry, and the aggregate `divider` theme target. The caller
owns the meaning of the surrounding regions.

Consumer syntax and examples belong in `Divider.doc.mjs`.

## Compatibility and migration

- Released default preserved: yes — horizontal, subtle, unlabelled, and not full
  bleed.
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes. ReactNode values that React renders, including
  numeric zero, stay inside the label wrapper; skipped scalar labels leave one
  continuous unnamed rule.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none.

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Theme-added variant without line paint (FR3).** `DividerVariantMap` admits
  theme-added values, but an unmatched value leaves the inner rule unpainted, so
  the line can disappear. `architecture:component-theming-surface` INV14
  requires an extensible visual axis to have a safe theme-independent baseline;
  OQ2 holds the remediation direction.
- **Caller `role` and `aria-orientation` replaced (FR6).** Divider sets
  `role="separator"` and `aria-orientation` after caller props, so a caller's
  explicit values never reach the root, where
  `architecture:public-component-api` INV5 lets a caller's explicit input reach
  the element.

## Ownership boundary

**Owns**

- One semantic separator root and its public ref, DOM, data, ARIA, class, style,
  event, and `xstyle` composition.
- Horizontal and vertical rule geometry.
- Optional label placement and the separator naming relationship.
- Built-in subtle and strong line weights.
- The reflected custom-variant state, including the missing line-paint fallback
  recorded under Current-state impact.
- Logical full-bleed consumption of inherited container inset.
- The aggregate `divider` target with reflected orientation and variant axes.

**Does not own / non-goals**

- The meaning or heading structure of surrounding content regions — owned by the
  product callsite.
- Container inset publication — owned by `architecture:container-padding`.
- A separate public target for Rule or Label — none exists; OQ1 holds the question.
- Theme-authored custom variant paint and the public part that should own it —
  OQ2 holds the question.

## Public concepts

| Concept      | Closed values or states                       | Meaning                                                                                       | Availability by variant/orientation/state | Default      | Owner                        | Stability                               | Invalid-value behavior                                                                     |
| ------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------ | ---------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| Orientation  | `horizontal`; `vertical`                      | Selects the separator axis, rule geometry, and `aria-orientation`.                            | Every divider                             | `horizontal` | component                    | stable                                  | Closed union; rejected by types                                                            |
| Label        | renderable ReactNode; omitted/skipped scalar  | Inserts one label between two rules and names the separator unless explicit ARIA naming wins. | Every orientation and variant             | omitted      | caller/component             | stable                                  | `null`, booleans, and empty strings render no label; numeric zero remains visible          |
| Variant      | `subtle`; `strong`; theme-added visual values | Selects line paint and reflects the requested value on the target.                            | Every orientation and label state         | `subtle`     | component/theme              | stable built-ins; theme-extensible axis | An unmatched custom value leaves the rule unpainted (FR3)                                  |
| Full bleed   | false; true                                   | Consumes inherited logical container inset on the divider axis.                               | Every orientation                         | false        | component/container protocol | stable                                  | Missing variables resolve to zero                                                          |
| Root surface | ref; DOM/data/ARIA; class/style/xstyle/events | Extends the semantic separator root.                                                          | Every divider                             | omitted      | public component API         | stable                                  | Accepted inputs compose; a caller `role` or `aria-orientation` is replaced today (FR6 gap) |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                     | Basis                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| FR1 | The divider renders one rule without a renderable label and two rules with the label between them. Numeric zero is a renderable label; `null`, booleans, and empty strings render no label. A horizontal divider is a full-width flex row and a vertical divider a full-height inline flex column; the label uses supporting type in secondary text with `--spacing-3` padding on the divider's axis.         | Released ReactNode API; current source, docs, and tests                     |
| FR2 | By default the root exposes `role="separator"` and the selected `aria-orientation`; a caller's explicit `role` or `aria-orientation` wins and is used as given, even where it contradicts `orientation` (FR6). A renderable label names it through `aria-labelledby` unless a caller `aria-label` or `aria-labelledby` is supplied.                                                                           | WCAG 2.2 SC 1.3.1 and 4.1.2; current source and tests                       |
| FR3 | `subtle` paints the rule `--color-border` and `strong` paints it `--color-border-emphasized`, at `--border-width`. The exported map accepts theme-added values, which the root reflects, and an extensible visual axis has a safe theme-independent baseline (`architecture:component-theming-surface` INV14). Implementation gap: an unmatched value leaves the inner rule unpainted (Current-state impact). | `architecture:component-theming-surface/INV4,INV6,INV14`; current source    |
| FR4 | Full bleed consumes the inherited logical inline inset for horizontal dividers and the logical block inset for vertical dividers, extending the box by the same amounts; absent inset resolves to zero.                                                                                                                                                                                                       | `architecture:container-padding/INV1,INV3,INV7–INV10`; current source       |
| FR5 | The root carries the `divider` target and reflects `orientation` and the requested `variant`. Rule and Label carry no public target. The reflected `data-orientation` and `data-variant` are component-owned theming state and replace a caller's values.                                                                                                                                                     | `architecture:component-theming-surface/INV3–INV6`; current source and docs |
| FR6 | `ref`, DOM, data, ARIA, class, style, event, and `xstyle` inputs reach or compose on the separator root, and a caller's explicit `role` or `aria-orientation` reaches it (`architecture:public-component-api` INV5). Implementation gap: the component sets `role` and `aria-orientation` after caller props, so a caller's values are replaced (Current-state impact).                                       | `architecture:public-component-api/INV5–INV8`; current source and tests     |

### Allowed variation

- **AV1 — Label content.** Any caller-owned ReactNode that React renders may fill
  the label wrapper.
- **AV2 — Theme paint.** An active theme may restyle the aggregate target and its
  variant axis. OQ2 owns the unresolved inner-rule paint and fallback boundary.
- **AV3 — Container geometry.** Full bleed follows the inherited per-edge inset,
  including asymmetric and zero values.

### Representative states

| State                               | Required invariant                                                                      | Allowed variation                          |
| ----------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------ |
| Unlabelled horizontal               | One subtle or strong inline rule; horizontal separator semantics                        | Container width and theme paint            |
| Labelled horizontal                 | Two rules around one visible, naming label                                              | Any renderable label content               |
| Numeric zero label                  | One visible `0` inside the label wrapper; separator name `0`                            | Any orientation or variant                 |
| Vertical labelled/unlabelled        | Block-axis rules and vertical separator semantics                                       | Container height and label content         |
| Theme-added variant without a match | Requested variant reflected; inner rule has no component-owned paint (FR3 gap)          | Custom variant name                        |
| Full bleed                          | Logical-axis inset consumed without physical-direction assumptions                      | Uniform, asymmetric, zero, or absent inset |
| RTL                                 | Horizontal geometry remains logical; full bleed consumes inline start/end independently | Surrounding content and label language     |

### Transformation and precedence order

- **ORD1 — Label presence.** Apply the shared renderable-value predicate; when a
  label remains, render and reference one wrapper between two rules.
- **ORD2 — Accessible name.** Explicit `aria-labelledby` wins, then explicit
  `aria-label`, then the rendered label wrapper; an unlabelled separator stays
  unnamed.
- **ORD3 — Variant paint.** Reflect the requested value on the root target. Built-in
  values select subtle or strong inner-rule paint; unmatched custom values select no
  inner-rule paint (FR3).

### Performance and resources

- **PR1 — No external lifecycle.** Divider installs no listener, observer, timer,
  request, state machine, or Effect.

## Accessibility contract

- **AR1 — Programmatic separator.** By default the root exposes separator role
  and the exact visual orientation; a caller's explicit `role` or
  `aria-orientation` wins (FR6), and today the component's values replace it
  (FR6 gap).
- **AR2 — Label relationship.** A rendered label names the separator unless the
  caller supplies an explicit accessible name relationship.
- **AR3 — Decorative rule segments.** Internal rule elements add no separate role,
  name, focus target, or interaction.

## Design relationships

| Anatomy or state | Design requirement                                                                            | Representation authority                                     | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------- | ------------------ |
| Divider group    | Arrange rule segments and the optional label on one logical axis.                             | Current source; container geometry from current architecture | supporting     | FR1, FR4           |
| Rule             | Paint a visible subtle or strong separation line; theme-added values lack a settled fallback. | Current source; custom fallback is the FR3 gap               | supporting     | FR3                |
| Label            | Present optional content between two rules using supporting text tokens.                      | Current source; no separate target (OQ1)                     | prominent      | FR1–FR2            |

No component-local design decision is recorded.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Divider group": {"target": "divider"},
  "Rule": {
    "none": {
      "reason": "unsettled: No current public target reaches this part"
    }
  },
  "Label": {
    "none": {
      "reason": "unsettled: No current public target reaches this part"
    }
  }
}
```

The two `none` dispositions record that no public target reaches Rule or Label;
OQ1 holds whether they should gain one.

## Family and system relationships

- `architecture:container-padding` owns the inherited internal inset protocol;
  Divider consumes it only through `isFullBleed`.
- `architecture:component-theming-surface` sets the rules for the target,
  reflected axes, and anatomy qualification, and the requirement that an open visual axis have
  a deterministic fallback. Divider's custom-value path does not satisfy that
  requirement (FR3); OQ2 holds the remediation direction.
- `architecture:public-component-api` owns root composition, ref behavior, and
  compatibility of the released ReactNode label surface.
- There is no current Divider family or design record.

## Verification map

| Contract           | Verification                                                                                                          | Representative states                                                    | Mutation or failure expectation                                                                                                                                                                                                                                                                                    | Audit section            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| FR1, FR2, AR1, AR2 | `Divider.test.tsx` orientation, label, naming, and numeric-zero tests                                                 | Labelled and unlabelled, numeric zero, explicit names, both orientations | Rendering zero outside the wrapper, an unnamed labelled separator, or role, orientation, or name drift fails. Gap: only the unlabelled horizontal default is in the stable visual baseline (`core-divider--default`); the vertical layout and the label's type and padding have no automated check.                | `audit:Divider/a11y`     |
| AR3                | Source review                                                                                                         | Labelled and unlabelled                                                  | Gap: no automated check fails if a rule segment gains a role, name, or tab stop.                                                                                                                                                                                                                                   | `audit:Divider/a11y`     |
| FR3, FR5           | `Divider.test.tsx` variant and target tests; `themingTargets.test.ts`; stable visual baseline `core-divider--default` | Subtle, strong, both orientations; default                               | A lost class or `orientation`/`variant` reflection fails; a changed default rule paint comes back changed for review. Gap: the strong paint and the unmatched theme-added path have no automated check.                                                                                                            | `audit:Divider/theming`  |
| FR4                | `@astryx/no-physical-properties` lint rule; `Divider.stories.tsx` full-bleed fixtures                                 | Horizontal and vertical, LTR and RTL, absent inset                       | A physical left/right property in Divider's styles fails lint. Gap: the `Divider.test.tsx` full-bleed test only checks that the element renders, so no automated check fails when full bleed is not applied, on the wrong axis, or with a non-zero fallback, and no browser right-to-left check covers full bleed. | `audit:Divider/layout`   |
| FR6                | `Divider.test.tsx` ref and passthrough tests                                                                          | Ref, extra props                                                         | A dropped ref or caller prop fails. Gap: the ref test accepts any element, so a ref on a wrapper passes; no test covers the styling-input merge or a caller `role` or `aria-orientation`.                                                                                                                          | `audit:Divider/behavior` |
| PR1                | Source review                                                                                                         | Every state                                                              | Gap: no automated check fails if Divider adds a listener, observer, timer, or effect.                                                                                                                                                                                                                              | `audit:Divider/behavior` |
| AR1, AR2           | Accessibility-tree evidence (`spec:AST-009` FR3)                                                                      | Labelled and unlabelled separators                                       | Gap: no accessibility-tree check proves the separator role, orientation, or name; the unit tests query the DOM.                                                                                                                                                                                                    | `audit:Divider/a11y`     |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

- **OQ1 — Should Rule or Label gain stable public theming targets?** (`human-api`)
  No public target reaches them today; that absence does not decide the answer.
- **OQ2 — Should the open `variant` axis close, or which painting part owns its
  deterministic custom-value fallback?** (`human-api`) The root target can carry
  theme paint while the inner rule carries built-in paint. Applying a subtle inner
  fallback can cover an existing root background; keeping the current path can make
  the rule disappear. Options: close the axis, move target ownership, or route
  paint through a reviewed public property.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
