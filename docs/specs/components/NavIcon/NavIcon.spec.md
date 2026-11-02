---
schema_version: 3
template_version: 7
kind: component
id: component:NavIcon
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
owners: [cixzhang]
review_triggers: [theming]
verified_by:
  [
    packages/core/src/NavIcon/NavIcon.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/NavIcon.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: []
---

# NavIcon component contract

## Contract at a glance

| Area                    | Contract                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `NavIcon` with a required `icon`; target `nav-icon`.                                                                                 |
| Behavior                | A display-only circular accent container, one medium element size square, that shows the caller's icon.                              |
| End-user impact         | Users see a consistent product mark in navigation headings; NavIcon adds nothing to the accessibility tree beyond the caller's icon. |
| Builder impact          | None.                                                                                                                                |
| Compatibility/readiness | Records shipped behavior; no public change.                                                                                          |
| Review checks           | Reject emitting any target besides `nav-icon`, or adding interaction semantics to the container.                                     |
| Governing rules         | `architecture:component-theming-surface`; `architecture:public-component-api`.                                                       |

This table is a review projection; the body below is authoritative.

## Intent

NavIcon renders caller-supplied icon content inside a circular navigation
container, typically as the logo of TopNavHeading or SideNavHeading. Consumer
usage lives in `NavIcon.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; the container emits only the
  canonical `nav-icon` target
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The circular container and its current `nav-icon` theming target.

**Does not own / non-goals**

- The artwork or component supplied through `icon` — owned by the caller,
  including its accessible name or decorative status.
- Interaction semantics — NavIcon remains a display-only container.
- Spacing the heading applies around a NavIcon — owned by
  `component:TopNavHeading` and `component:SideNavHeading`.

## Public concepts

No component-local concept beyond the consumer props.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                           | Basis                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1 | NavIcon renders one `<span>` circular container, centered, sized to `--size-element-md` on both axes, painted with the accent color and on-accent foreground, that contains `icon`. | Current source, docs, and tests |
| FR2 | The container carries only the canonical `nav-icon` target.                                                                                                                         | Current source, docs, and tests |
| FR3 | The container forwards its `ref`, `data-testid`, and other DOM props, and merges `className`, `style`, and `xstyle` after component styles. It adds no role, name, or focus stop.   | Current source and tests        |

### Allowed variation

- **AV1 — Artwork.** Caller-supplied icon artwork and implementation may vary
  without becoming NavIcon-owned anatomy.

### Representative states

| State    | Required invariant                  | Allowed variation |
| -------- | ----------------------------------- | ----------------- |
| Any icon | Same circular container and target. | Artwork.          |

### Transformation and precedence order

- No precedence rule.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Transparent container.** NavIcon contributes no semantics; the
  caller's icon decides what assistive technology perceives (FR3).

## Design relationships

| Anatomy or state | Design requirement                            | Representation authority       | Hierarchy role    | Component contract |
| ---------------- | --------------------------------------------- | ------------------------------ | ----------------- | ------------------ |
| Container        | Presents the circular accent painted surface. | Current source and public docs | Supporting        | FR1, FR2           |
| Icon             | Presents caller-supplied visual content.      | Caller-supplied content        | Context-dependent | FR1                |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Container": {"target": "nav-icon"},
  "Icon": {"inherits": "nav-icon"}
}
```

## Family and system relationships

- `architecture:component-theming-surface` owns the target and its
  qualification.
- `architecture:public-component-api` owns how the forwarded inputs compose.

## Verification map

| Contract            | Verification                                                   | Representative states                | Mutation or failure expectation                                                                                                                    | Audit section           |
| ------------------- | -------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| FR1, FR3            | `NavIcon.test.tsx` content, ref, and test-id suites            | Caller-supplied icon                 | Removing the container, content, ref, or test id fails.                                                                                            | `audit:NavIcon/anatomy` |
| FR2                 | `NavIcon.test.tsx` target-name suite; `themingTargets.test.ts` | Canonical target class               | A missing or renamed canonical target, or the removed `navicon` alias, fails the target assertion; an extra target fails `themingTargets.test.ts`. | `audit:NavIcon/theming` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                  | Canonical anatomy and current target | Missing, extra, prefixed, stale, or alias-backed mappings fail repository validation.                                                              | `audit:NavIcon/theming` |

Read from source, with no focused test yet: the container's circular shape, size, and accent colors (FR1); and other DOM props, the `className`,
`style`, and `xstyle` merge, and the absence of a role, name, or focus stop
(FR3).

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, implementation
steps, or system rules. It links to their owners.
