---
schema_version: 3
template_version: 5
kind: component
id: component:ChartLegend
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/charts/src/ChartLegend.test.tsx,
    apps/storybook/stories/charts/Legend.stories.tsx,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-test-sufficiency,
    architecture:component-theming-surface,
  ]
contributing: []
system_specs: [spec:AST-002, spec:AST-029]
---

# ChartLegend component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | No API shape or default changes. This draft records the current item, logical placement, alignment, list-semantics, and empty-output surface.                                 |
| Behavior                | Non-empty items render in order as a named list; top/bottom use a wrapping row, start/end use a column, alignment remains logical, and omitted or empty items render nothing. |
| End-user impact         | Chart readers receive visible series names paired with decorative mark-shaped color keys; this audit changes no rendered behavior.                                            |
| Builder impact          | Existing callsites remain valid and gain direct CLI documentation for the shipped props, defaults, composition, and accessibility boundary.                                   |
| Compatibility/readiness | The package remains canary-only. This observational draft is non-authoritative; series distinction by arbitrary caller colors remains unresolved.                             |
| Review checks           | Reject a changed public shape/default, lost list semantics or localization, reordered items, a wrong orientation, or a new claim that color alone is sufficient.              |
| Governing rules         | `spec:AST-029/FR3–FR7`, `architecture:component-test-sufficiency/INV1–INV11`, `architecture:component-theming-surface/INV1–INV6`, and `spec:AST-002`.                         |

This table is a review projection; the body below is authoritative.

## Intent

ChartLegend presents the visible key for a chart's series. It owns the ordered
legend list, entry layout, mark-shaped decorative swatches, series labels, and
the empty render. A parent Chart may derive its items and place the resulting
legend around the plot; callers may also render the component directly.

## Compatibility and migration

- Released default preserved: yes at the canary surface; the package has no stable release.
- Compatibility class: no public API, default, or rendered-behavior change.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none; this draft does not authorize a public API change.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Rendering non-empty legend items in caller order.
- Choosing horizontal or vertical layout from logical placement.
- Aligning the entry collection along the relevant logical axis.
- Pairing each visible series label with a decorative swatch shape and caller color.
- Localizing and exposing the legend list name.

**Does not own / non-goals**

- Series derivation, palette assignment, plot placement, or chart render order — owned by `component:Chart` and its series utilities.
- The chart's accessible name, data alternative, or product summary — owned by `component:Chart` and the product callsite.
- Custom legend interactions, selection, filtering, or visibility controls.
- A guarantee that arbitrary caller-supplied colors alone distinguish every series.

## Public concepts

| Concept          | Closed values or states                     | Meaning                                                                                    | Availability by variant/orientation/state | Default  | Owner                   | Stability    | Invalid-value behavior                        |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------- | -------- | ----------------------- | ------------ | --------------------------------------------- |
| Legend items     | ordered array or empty                      | Supplies each entry's label, color, and optional mark type.                                | Every ChartLegend                         | `[]`     | `component:ChartLegend` | experimental | Omitted and empty arrays render nothing.      |
| Logical position | `top`, `bottom`, `start`, `end`             | Gives Chart placement intent and selects row or column orientation.                        | Non-empty                                 | `bottom` | `component:ChartLegend` | experimental | Closed by the exported TypeScript union.      |
| Alignment        | `start`, `center`, `end`                    | Distributes a horizontal row inline or aligns entries horizontally inside a vertical list. | Non-empty                                 | `start`  | `component:ChartLegend` | experimental | Closed by the exported TypeScript union.      |
| Swatch shape     | square for `bar`; line for every other type | Visually echoes the item's mark category without adding AT content.                        | Each rendered item                        | line     | `component:ChartSwatch` | experimental | Unknown and omitted types use the line shape. |
| List semantics   | localized list with one item per entry      | Groups the visible labels as one named legend.                                             | Non-empty                                 | built in | `component:ChartLegend` | experimental | Not applicable.                               |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision.

| ID  | Candidate invariant                                                                                                                                                                                       | Basis                                                        | Draft review state |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------ |
| FR1 | ChartLegend MUST render nothing when `items` is omitted or empty and MUST otherwise preserve item order and duplicate labels.                                                                             | implementation and focused tests                             | verify             |
| FR2 | Each rendered item MUST remain one visible label plus one assistive-technology-hidden ChartSwatch inside a list item.                                                                                     | implementation, focused tests, and browser accessibility run | verify             |
| FR3 | The root MUST remain a localized named list with exactly one list item per supplied entry.                                                                                                                | implementation, locale catalog, focused tests, and axe       | verify             |
| FR4 | `top` and `bottom` MUST use a wrapping horizontal row; `start` and `end` MUST use a vertical column.                                                                                                      | implementation and receipted browser matrix                  | verify             |
| FR5 | Alignment MUST remain logical: for `top` and `bottom`, it distributes the row along the inline axis; for `start` and `end`, it aligns entries horizontally within the vertical list, including under RTL. | implementation and receipted LTR/RTL browser evidence        | verify             |
| FR6 | Swatch shape MUST be square for `bar` and a short line for every other or omitted type; caller color supplies its paint.                                                                                  | ChartSwatch implementation and focused tests                 | verify             |
| FR7 | Long labels MUST wrap without horizontal viewport overflow at 320 CSS pixels; no fixed-width truncation contract is currently exposed.                                                                    | receipted browser evidence                                   | verify             |

### Allowed variation

- **AV1 — Available space.** Horizontal entries wrap to additional rows as the containing width narrows; vertical entry labels may wrap within the available inline size.
- **AV2 — Series paint.** Swatch color is caller-owned and may vary by chart palette and rendered surface, subject to the unresolved distinction requirement below.

### Representative states

| State                 | Required invariant                                                  | Allowed variation                                                   |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Omitted / empty items | No legend DOM is rendered.                                          | Surrounding Chart layout may omit its legend slot.                  |
| Bottom or top         | Entries form a wrapping horizontal list.                            | Logical alignment and wrapping depend on available width.           |
| Start or end          | Entries form a vertical list.                                       | Alignment changes each entry's horizontal position within the list. |
| Duplicate labels      | Every supplied item remains present and ordered.                    | Internal React keys may disambiguate equal labels.                  |
| Long narrow labels    | Labels wrap and the page remains free of horizontal overflow.       | Entry and list height grow with content.                            |
| RTL                   | Logical start/end behavior follows the computed document direction. | Visual item order follows the flex and direction model.             |

### Transformation and precedence order

- **ORD1 — Render.** Default omitted props → return nothing for zero items → derive orientation from logical position → map items in caller order → apply logical alignment to the list root.
- **ORD2 — Entry.** Map mark type to a swatch shape → paint the swatch with caller color → render the caller label as supporting text.

### Performance and resources

- **PR1 — Derived output.** ChartLegend remains render-derived. It owns no state, Effect, listener, observer, timer, request, or persistent resource.

## Accessibility contract

- **AR1 — Named structure.** A non-empty legend exposes one localized named list and one list item for every visible series label.
- **AR2 — Decorative swatches.** Series swatches stay hidden from assistive technology; the adjacent visible text supplies each entry name.
- **AR3 — Chart-level alternative.** The legend supplements rather than replaces the parent Chart's accessible name and equivalent data representation.
- **AR4 — Composed association evidence.** Standalone ChartLegend evidence does not establish how readers associate legend entries with rendered chart marks. Evaluate same-mark-shape series in a composed Chart or product callsite before deciding whether an additional visual cue is needed or which layer owns it.

## Design relationships

| Anatomy or state | Design requirement                                                | Representation authority                      | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------------------- | --------------------------------------------- | -------------- | ------------------ |
| Legend list      | Group related series entries without adding an interactive state. | unsettled; no current design record is linked | supporting     | FR1, FR3–FR5       |
| Legend entry     | Keep each label associated with one series key.                   | unsettled; no current design record is linked | supporting     | FR1–FR3            |
| Series swatch    | Echo the chart mark while remaining decorative to AT.             | unsettled; caller color is current behavior   | supporting     | FR2, FR6, AR2–AR4  |
| Series label     | Name the series as readable supporting text.                      | delegated to Text                             | supporting     | FR2, AR1–AR2       |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Legend list": {
    "delegatesTo": {"owner": "component:Stack", "target": "stack"}
  },
  "Legend entry": {
    "delegatesTo": {"owner": "component:Stack", "target": "stack"}
  },
  "Series swatch": {
    "none": {
      "reason": "unsettled: ChartSwatch owns the visible painter but exposes no current public target; this draft does not decide future reachability."
    }
  },
  "Series label": {
    "delegatesTo": {"owner": "component:Text", "target": "text"}
  }
}
```

ChartLegend delegates list and entry layout to Stack's existing target, and
series labels to Text. ChartSwatch is the visible swatch painter but does not
currently expose a public theme target. Whether that anatomy should become
reachable remains with the ChartSwatch and theming owners.

## Family and system relationships

- No current family or design record governs ChartLegend.
- `architecture:component-test-sufficiency` owns rational public-state partitions, observable assertions, and audit evidence quality.
- `architecture:component-theming-surface` owns anatomy-to-target disposition; composition from themed primitives does not enroll ChartLegend in public component theming.
- `spec:AST-002` owns public API admission and prevents this audit from adding or reinterpreting a public choice.
- `spec:AST-029` owns this observational backfill, closed evidence receipt, safe remediation, and fail-closed eligibility report.

## Verification map

| Contract     | Verification                                             | Representative states                                        | Mutation or failure expectation                                                                               | Audit section                              |
| ------------ | -------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| FR1–FR3      | `ChartLegend.test.tsx`; focused axe run                  | omitted, empty, non-empty, localized, duplicate              | Empty output leaves DOM, an entry disappears, or list semantics/name are lost.                                | `audit:ChartLegend/accessibility-behavior` |
| FR4–FR5, FR7 | receipted Storybook browser matrix; RTL geometry receipt | row, column, all alignments, 320px long text, RTL            | Orientation, logical alignment, wrapping, or viewport containment changes.                                    | `audit:ChartLegend/layout-responsive-rtl`  |
| FR6          | `ChartLegend.test.tsx`; `ChartSwatch.test.tsx`           | bar, line, omitted and unknown types                         | A bar loses its square, another type gains one, or swatch paint stops following color.                        | `audit:ChartLegend/behavior-design`        |
| AR1–AR3      | role/name DOM assertions; focused axe run; Chart tests   | standalone and Chart-composed legend                         | Labels leave the named list or the legend replaces the Chart alternative.                                     | `audit:ChartLegend/accessibility`          |
| AR4          | future composed Chart/callsite browser evidence          | at least two same-mark-shape series and their rendered marks | Association evidence must cover the legend and plotted marks before recording a defect or assigning an owner. | `audit:ChartLegend/unscored-evidence-gap`  |

## Decision log

None. This draft records observed behavior and evidence gaps only.

## Open questions

- **OQ1 — Composed series association.** In a composed Chart or product callsite, does evidence with two or more same-mark-shape series show that readers need an additional visual association cue? If so, which layer owns it: ChartLegend, the parent Chart/series definition, or the product callsite? (`human-design`)
- **OQ2 — Swatch theming reachability.** Should series swatches become a public ChartSwatch theme target, or should their paint remain caller-owned? (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit results,
implementation steps, or shared system rules. It links to their owners.
