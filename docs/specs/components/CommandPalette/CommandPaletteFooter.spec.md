---
schema_version: 3
template_version: 7
kind: component
id: component:CommandPaletteFooter
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, theming]
verified_by:
  [
    packages/core/src/CommandPalette/CommandPaletteFooter.test.tsx,
    packages/core/src/CommandPalette/__tests__/CommandPaletteFooter.a11y.chromium.spec.ts,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: []
---

# CommandPaletteFooter component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `CommandPaletteFooter` with optional `children`, `ref`, `xstyle`, `className`, `style`, and root DOM props.                               |
| Behavior                | A footer row of keyboard guidance: by default, the navigate, select, and close shortcuts with translated labels; `children` replace them. |
| End-user impact         | People see which keys move through, run, and close the palette.                                                                           |
| Builder impact          | None.                                                                                                                                     |
| Compatibility/readiness | Records shipped behavior; no public change.                                                                                               |
| Review checks           | Reject a footer that takes a role or name of its own, a lost default shortcut, or guidance that cannot wrap.                              |
| Governing rules         | `component:Kbd`; `architecture:public-component-api`; `architecture:component-theming-surface`.                                           |

This table is a review projection; the body below is authoritative.

## Intent

CommandPaletteFooter is the guidance row at the bottom of a CommandPalette.
Consumer usage lives in `CommandPaletteFooter.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The footer root, its layout, supporting text style, and the
  `command-palette-footer` target (FR1, FR3).
- The default guidance and its replacement by `children` (FR2).
- Root ref, DOM props, and styling (FR4).

**Does not own / non-goals**

- Painting each shortcut — owned by `component:Kbd`.
- The keyboard behavior the guidance describes — owned by
  `component:CommandPalette`.

## Public concepts

No component-local concept beyond the consumer props.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                               | Basis                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | The root is a wrapping row of supporting text in the secondary color, with no role or name of its own.                                                                                                  | Current source and tests |
| FR2 | Without `children`, the root shows three hints in order: Up and Down with the translated navigate label, Enter with select, and Escape with close, each shortcut a `Kbd`. `children` replace all three. | Current source and tests |
| FR3 | The root carries the `command-palette-footer` target.                                                                                                                                                   | Current source and tests |
| FR4 | `ref`, DOM props, `className`, `style`, and `xstyle` reach the root, with the caller's class after the generated ones.                                                                                  | Current source and tests |

### Allowed variation

- **AV1 — Guidance.** Callers may replace the default hints.
- **AV2 — Translation.** Label text follows the active locale.

### Representative states

| State          | Required invariant                          | Allowed variation |
| -------------- | ------------------------------------------- | ----------------- |
| Default        | Navigate, select, and close hints in order. | Locale.           |
| Custom         | `children` replace the defaults.            | Content.          |
| Narrow surface | Hints wrap onto more lines.                 | Line count.       |

### Transformation and precedence order

- **ORD1 — Content.** `children` when given, otherwise the default hints.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — No owned semantics.** The footer adds no role, name, or focus
  target; each shortcut's semantics are Kbd's.

## Design relationships

| Anatomy or state  | Design requirement                     | Representation authority | Hierarchy role | Component contract |
| ----------------- | -------------------------------------- | ------------------------ | -------------- | ------------------ |
| Footer            | A wrapping row of supporting guidance. | Current source           | Supporting     | FR1, FR3           |
| Keyboard shortcut | Shows one shortcut.                    | `component:Kbd`          | Supporting     | FR2                |

The aggregate CommandPalette anatomy map, owned by `component:CommandPalette`,
maps the Footer and Keyboard shortcut parts.

## Family and system relationships

- `component:Kbd` owns shortcut painting and semantics.
- `component:CommandPalette` owns the keyboard behavior the guidance names.

## Verification map

| Contract | Verification                                                                            | Representative states | Mutation or failure expectation                    | Audit section                           |
| -------- | --------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------- | --------------------------------------- |
| FR1, AR1 | `CommandPaletteFooter.test.tsx` wrap test; `CommandPaletteFooter.a11y.chromium.spec.ts` | narrow; LTR and RTL   | A role or name on the root, or no wrapping, fails. | `audit:CommandPaletteFooter/layout`     |
| FR2      | `CommandPaletteFooter.test.tsx` default-labels and custom-children tests                | default; custom       | A lost hint or ignored children fails.             | `audit:CommandPaletteFooter/behavior`   |
| FR3      | `CommandPaletteFooter.test.tsx` "carries the stable theme target on its single root"    | any                   | A missing target fails.                            | `audit:CommandPaletteFooter/theming`    |
| FR4      | `CommandPaletteFooter.test.tsx` className, xstyle, style, ref, and DOM-prop tests       | root inputs           | A dropped input fails.                             | `audit:CommandPaletteFooter/public-api` |

Read from source, with no focused test yet:

- FR1: the supporting type and secondary color.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples, or
CommandPalette's search and keyboard behavior. It links to their owners.
