---
schema_version: 3
template_version: 7
kind: component
id: component:InputGroupText
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [public-api, layout, theming]
verified_by:
  [
    packages/core/src/InputGroup/InputGroup.test.tsx,
    packages/core/src/InputGroup/InputGroupText.test.tsx,
    packages/core/src/InputGroup/__tests__/InputGroupTextAudit.a11y.chromium.spec.ts,
    packages/core/src/utils/mergeProps.test.ts,
    apps/storybook/rtl-audit/targets.json,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: []
---

# InputGroupText component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. InputGroupText takes `children` and the base props.                                                                                                     |
| Behavior                | A non-interactive, muted text or icon cell inside InputGroup that joins its neighbours' borders and rounds only the group's outer corners.                            |
| End-user impact         | People see a fixed prefix or suffix such as `$` or `https://` as part of the field. It is read as plain text, not as a control.                                       |
| Builder impact          | None.                                                                                                                                                                 |
| Compatibility/readiness | Records shipped behavior; no API or default change. Plain text with no right-to-left letter sits in an inner `span` with `dir="ltr"`, and the cell isolates its text. |
| Review checks           | Reject an interactive role or tab stop on the cell, text that wraps or shrinks, or rounded inner corners.                                                             |
| Governing rules         | `component:InputGroup`; `architecture:component-theming-surface`.                                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

InputGroupText is InputGroup's text addon: a fixed piece of text or an icon
shown before or after the input. Consumer usage lives in
`InputGroupText.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: no public prop, default, or export change. The DOM
  changes: plain text with no right-to-left letter sits in an inner `span`
  with `dir="ltr"`, and the cell isolates its text (`unicode-bidi: isolate`)
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The text cell's paint, sizing, border join, and corner rounding.
- The `input-group-text` target.

**Does not own / non-goals**

- Group label, row height, and description — owned by `component:InputGroup`.
- Naming or describing the input — the cell is not referenced by the input's
  name or description.
- Use outside InputGroup — uncontracted.

## Public concepts

No new public concept. Content is caller text or an icon.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                  | Basis                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| FR1 | InputGroupText renders one non-interactive element with no role, holding `children`; plain text with no right-to-left letter sits in an inner `span` with `dir="ltr"` (`design:bidirectionality` DR2). `ref`, `className`, `style`, `xstyle`, and other DOM props reach the outer element. | Current source and tests                                 |
| FR2 | The cell centers its content vertically with small inline padding, uses body text in the secondary text color on the muted background, never wraps, and never shrinks.                                                                                                                     | Current source                                           |
| FR3 | The cell draws an emphasized one-border-width border. Every cell after the first overlaps its leading neighbour by one border width. Only the first child's leading corners and the last child's trailing corners are rounded with the element radius.                                     | Current source                                           |
| FR4 | The cell carries `astryx-input-group-text`.                                                                                                                                                                                                                                                | `architecture:component-theming-surface`; current source |

### Allowed variation

- **AV1 — Content.** Any text or icon. The cell reads plain text only to choose its direction (FR1); rich content is isolated, and the caller marks its direction.
- **AV2 — Theme paint.** Themes may restyle the cell through
  `input-group-text`.

### Representative states

| State  | Required invariant                                     | Allowed variation |
| ------ | ------------------------------------------------------ | ----------------- |
| Prefix | Leading corners rounded; trailing edge square.         | Content.          |
| Suffix | Trailing corners rounded; overlaps the input's border. | Content.          |

### Transformation and precedence order

- **ORD1 — Styling.** Component styles, then `xstyle`, then `className` and
  `style`.

### Performance and resources

- **PR1 — Static.** No state, effect, or listener.

## Accessibility contract

- **AR1 — Plain text.** The cell has no role or tab stop and is read as
  ordinary text in reading order.

## Design relationships

| Anatomy or state | Design requirement                                      | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Text cell        | Muted, bordered, secondary-text cell joined to the row. | Current source           | Supporting     | FR2, FR3           |

No design record governs InputGroupText.

## Family and system relationships

- `component:InputGroup` hosts the cell and owns the row it joins.

## Verification map

| Contract                      | Verification                                                                                                                                                                                                                              | Representative states                                                                                              | Mutation or failure expectation                                                                                                                                                                                               | Audit section                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1                           | `InputGroupText.test.tsx` "is plain text with no role and no tab stop (FR1, AR1)" and "passes ref, DOM props, className, and style to the cell, which carries its target (FR1, FR4)"; `InputGroup.test.tsx` addon and prefix/suffix cases | Prefix and suffix text; a `ref`, a DOM prop, `className`, and `style`                                              | A role, a tab stop, missing addon text, or a prop that does not reach the cell fails.                                                                                                                                         | `audit:InputGroupText/anatomy`  |
| FR2                           | `InputGroupText.test.tsx` "keeps its content on one line, unshrunk and centered on the cross axis (FR2)"; `InputGroupTextAudit.a11y.chromium.spec.ts` paint checks                                                                        | Prefix, suffix, and both; small and large sizes; a narrow viewport; light, dark, and Butter                        | Wrapping, shrinking, off-centre content, or padding, text colour, font size, or background other than the token fails. Evidence gap: no check asserts the body font family or line height.                                    | `audit:InputGroupText/layout`   |
| FR3                           | `InputGroupTextAudit.a11y.chromium.spec.ts` border, join, and corner checks                                                                                                                                                               | A prefix and a suffix around a text input; LTR and RTL                                                             | A border colour or width other than the token, a border style other than `solid`, an overlap other than one border width, or a rounded inner corner fails.                                                                    | `audit:InputGroupText/layout`   |
| FR4                           | `InputGroupText.test.tsx` "passes ref, DOM props, className, and style to the cell, which carries its target (FR1, FR4)"; `InputGroupTextAudit.a11y.chromium.spec.ts` class check                                                         | Each cell                                                                                                          | A cell without `astryx-input-group-text` fails.                                                                                                                                                                               | `audit:InputGroupText/anatomy`  |
| ORD1                          | `InputGroupText.test.tsx` "applies caller xstyle after its own styles (ORD1)"; `mergeProps.test.ts` "treats a string third argument as an appended className" and "applies the fourth argument as an overriding style"                    | A caller `xstyle`, `className`, and `style` that override a cell style                                             | A cell style that wins over caller `xstyle`, a caller `className` that replaces the cell classes instead of being appended, or a caller `style` that does not override fails.                                                 | `audit:InputGroupText/anatomy`  |
| RTL relation                  | RTL audit curated D2 target (`apps/storybook/rtl-audit/targets.json`) on `InputGroup / With prefix`; `InputGroupTextAudit.a11y.chromium.spec.ts` RTL case on `InputGroup / With prefix and suffix`                                        | A text prefix before a text input, and a prefix and suffix around one; LTR and RTL                                 | A prefix that is not at the inline start of its input fails D2. In the audit, a cell that does not follow the row direction, or an overlap on the wrong side, fails.                                                          | `audit:InputGroupText/i18n-rtl` |
| `design:bidirectionality` DR2 | `MixedDirectionText.a11y.chromium.spec.ts`                                                                                                                                                                                                | `https://`, `.com`, `+3`, `@alice`, `iPhone جديد` and `example.com موقع` under RTL and LTR (Mixed Direction story) | Addon text whose weak or neutral characters reorder under RTL (`//:https`, `com.`, `3+`, `alice@`), or right-to-left text with a leading Latin word that lays out left to right, fails on each character's rendered position. | `audit:InputGroupText/i18n-rtl` |

## Decision log

No component-local decision.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
