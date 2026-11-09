---
schema_version: 3
template_version: 7
kind: component
id: component:Breadcrumbs
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Breadcrumbs/Breadcrumbs.test.tsx,
    packages/core/src/Breadcrumbs/__tests__/Breadcrumbs.a11y.test.tsx,
    packages/core/src/Breadcrumbs/__tests__/Breadcrumbs.a11y.chromium.spec.ts,
    apps/storybook/stories/Breadcrumbs.stories.tsx,
  ]
modules: []
families: []
design_specs: [design:bidirectionality]
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-038]
---

# Breadcrumbs component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `Breadcrumbs` with `children`, `separator` (default `/`), `variant` (`default`, `supporting`, or an augmented value; default `default`), and `label`; target `breadcrumbs` with `variant`. |
| Behavior                | A labeled navigation landmark holding an ordered list of BreadcrumbItem children; it tells every item in its own surface the separator and variant to use.                                 |
| End-user impact         | Screen-reader users find the trail as a named "Breadcrumb" landmark and hear it as an ordered list; sighted users see one consistent separator and size across the trail.                  |
| Builder impact          | None.                                                                                                                                                                                      |
| Compatibility/readiness | Records shipped behavior; no public change.                                                                                                                                                |
| Review checks           | Reject an unlabeled landmark, a trail that is not an ordered list, or items in the trail's own surface that ignore its separator or variant.                                               |
| Governing rules         | `component:BreadcrumbItem` (each item); `design:bidirectionality` DR4 (separator mirroring); `architecture:component-theming-surface`.                                                     |

This table is a review projection; the body below is authoritative.

## Intent

Breadcrumbs shows where a page sits in a hierarchy. It owns the trail's
landmark, list, label, separator, and variant; each crumb's behavior belongs to
BreadcrumbItem. Consumer usage lives in `Breadcrumbs.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The navigation landmark, its label, the ordered list, its wrapping layout, and
  the separator and variant every item in its own surface receives (FR1–FR4).

**Does not own / non-goals**

- Each crumb's element, current-page state, separator rendering, menu, and the
  `breadcrumb-item`, `breadcrumb-item-menu-trigger`, and `breadcrumb-menu`
  targets — owned by `component:BreadcrumbItem`.
- Destination handling — owned by `family:navigation-destinations` through
  BreadcrumbItem.
- Truncating or collapsing long trails — not provided; the list wraps.

## Public concepts

| Concept   | Closed values or states                   | Meaning                                         | Availability by variant/orientation/state | Default   | Owner                   | Stability | Invalid-value behavior                                        |
| --------- | ----------------------------------------- | ----------------------------------------------- | ----------------------------------------- | --------- | ----------------------- | --------- | ------------------------------------------------------------- |
| Variant   | `default`, `supporting`, augmented values | Body or supporting text size for every item.    | Whole trail.                              | `default` | `component:Breadcrumbs` | Stable    | A value other than `supporting` gets default sizing on items. |
| Separator | any node; `/` by default                  | Glyph shown before every item except the first. | Whole trail.                              | `/`       | `component:Breadcrumbs` | Stable    | Rendered as given.                                            |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                          | Basis                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | Breadcrumbs renders one `<nav>` named by `label`, else the translated `@astryx.breadcrumbs.label` ("Breadcrumb"); a caller `aria-label` or `aria-labelledby` replaces that name. It carries `breadcrumbs` with `variant`, the forwarded `ref`, `data-testid`, and other DOM props. | Current source and tests |
| FR2 | The `<nav>` contains one `<ol>` that holds `children`; the list has no markers or inset and lays items out in a row that wraps.                                                                                                                                                    | Current source and tests |
| FR3 | Every descendant BreadcrumbItem in the trail's own surface receives the trail's `separator` and `variant`; a crumb rendered inside a layer gets the defaults, as `spec:AST-038` FR7 requires.                                                                                      | Current source and tests |
| FR4 | `className`, `style`, and `xstyle` merge onto the `<nav>` after component styles.                                                                                                                                                                                                  | Current source           |

### Allowed variation

- **AV1 — Separator.** Any node may replace `/`.
- **AV2 — Theme styling.** Themes restyle `breadcrumbs` per variant.

### Representative states

| State              | Required invariant                            | Allowed variation |
| ------------------ | --------------------------------------------- | ----------------- |
| Default trail      | Named landmark; ordered list; `/` separators. | Item content.     |
| Supporting variant | Items use supporting size.                    | —                 |
| Custom separator   | Items show the given separator.               | Glyph.            |
| Narrow container   | Items wrap onto more lines.                   | Line count.       |

### Transformation and precedence order

- **ORD1 — Label.** A caller `aria-label` or `aria-labelledby`, then `label`,
  then the translated default.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Landmark and list.** FR1 and FR2: one named navigation landmark with
  an ordered list of crumbs.

## Design relationships

| Anatomy or state | Design requirement               | Representation authority       | Hierarchy role | Component contract |
| ---------------- | -------------------------------- | ------------------------------ | -------------- | ------------------ |
| Trail            | Wrapping row of crumbs.          | Current source and public docs | Supporting     | FR1, FR2           |
| Item             | One crumb.                       | `component:BreadcrumbItem`     | Supporting     | FR3                |
| Separator        | Trail-wide glyph between crumbs. | `component:BreadcrumbItem`     | Supporting     | FR3                |
| Icon             | Optional crumb start content.    | `component:BreadcrumbItem`     | Supporting     | —                  |

No anatomy-theming map is recorded yet; the block is optional during migration.
Mapping the four anatomy parts against the four targets `Breadcrumbs.doc.mjs`
lists, three of which BreadcrumbItem owns, by delegation, is deferred.

## Family and system relationships

- `component:BreadcrumbItem` renders each crumb and its separator.
- `design:bidirectionality` DR4 governs the default separator's mirroring, which
  BreadcrumbItem implements.

## Verification map

| Contract | Verification                                                       | Representative states                 | Mutation or failure expectation            | Audit section                     |
| -------- | ------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------ | --------------------------------- |
| FR1, AR1 | `Breadcrumbs.test.tsx` landmark tests; `Breadcrumbs.a11y.test.tsx` | Default and custom label              | A missing landmark or name fails.          | `audit:Breadcrumbs/accessibility` |
| FR2      | `Breadcrumbs.test.tsx` ordered-list test                           | Several items                         | A non-list trail fails.                    | `audit:Breadcrumbs/anatomy`       |
| FR3      | `Breadcrumbs.test.tsx` separator and variant tests                 | Default, custom separator, supporting | Items that ignore the trail settings fail. | `audit:Breadcrumbs/behavior`      |
| FR1      | `Breadcrumbs.test.tsx` ref and test-id tests                       | Root props                            | Dropped ref or test id fails.              | `audit:Breadcrumbs/api`           |

Read from source, with no focused test yet: crumbs inside a layer getting the
defaults (FR3); the `breadcrumbs` target and its
`variant` state, other DOM props, and a caller `aria-label` or
`aria-labelledby` replacing the name (FR1); the list's markers, inset, and
wrapping row (FR2); and FR4.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, or item behavior. It
links to their owners.
