---
schema_version: 3
template_version: 7
kind: component
id: component:Pagination
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Pagination/Pagination.test.tsx,
    packages/core/src/hooks/useListFocus.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: [design:bidirectionality, design:reduced-motion]
architecture:
  [
    architecture:component-theming-surface,
    architecture:internationalization,
    architecture:public-component-api,
  ]
contributing: []
system_specs:
  [spec:AST-020/FR15, spec:AST-085, spec:AST-086, spec:AST-094, spec:AST-102]
---

# Pagination component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | None changes. Pagination takes `page`, `onChange`, `changeAction`, `totalItems`, `totalPages`, `hasMore`, `pageSize`, `pageSizeOptions`, `onPageSizeChange`, `variant`, `pageLabel`, `hasFirstLast`, `step`, `siblingCount`, `size`, `isDisabled`, `label`, and base props.          |
| Behavior                | A labelled navigation landmark with Previous and Next buttons around a variant-specific indicator. Every page change calls `onChange`, announces the new page, and runs an optional `changeAction` with an optimistic page.                                                          |
| End-user impact         | People move through pages by buttons, page numbers, dots, or typing a page, and screen-reader users hear the page they landed on. A keyboard user on Next at the last page loses focus because Next becomes natively disabled.                                                       |
| Builder impact          | None.                                                                                                                                                                                                                                                                                |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Boundary and disabled buttons use native `disabled`, the dots are not exposed as a radio group and have no coarse-pointer hit area, and delegated Buttons carry their own gaps; all are listed under Current-state impact. |
| Review checks           | Reject a page change outside 1 to the total, a page change without an announcement, a disabled Pagination that changes page, a landmark without a name, or a delegated control re-themed by Pagination.                                                                              |
| Governing rules         | `spec:AST-020` FR15, DEC-4; `spec:AST-085` FR1, FR4, FR7; `spec:AST-086`; `spec:AST-094` FR42; `spec:AST-102` FR4; `design:bidirectionality` DR6; `design:reduced-motion` DR1; `architecture:component-theming-surface`; `architecture:internationalization` INV1a.                  |

This table is a review projection; the body below is authoritative.

## Intent

Pagination presents controls for moving through pages and may let people choose
a page size or enter a page directly. It owns the page arithmetic, which
controls render for each variant, the page-change pipeline and announcement,
and its four local theming targets. Consumer usage lives in
`Pagination.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; `variant="pages"`, `pageSize={10}`,
  `step={1}`, `siblingCount={1}`, `size="md"`
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: controlled; `page` is the committed page,
  and Pagination shows an optimistic page only while a `changeAction` is pending
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The Pagination navigation landmark and its current `pagination` target.
- The Dot, Page input label, and Page input total parts and their current
  `pagination-dot`, `pagination-input-label`, and `pagination-input-total`
  targets.
- Choosing which stable controls and readouts render for the current paging
  configuration.
- Page-count arithmetic, step clamping, the page range with ellipses, and the
  page-change pipeline and announcement.

**Does not own / non-goals**

- Button, Text, NumberInput, or Selector presentation and targets; those remain
  owned by their respective components.
- Button icon artwork or other internals of delegated controls.
- A public target for Ellipsis; none exists (OQ2).
- Fetching or slicing the data being paged — owned by the caller.

## Public concepts

| Concept    | Closed values or states                              | Meaning                                               | Availability by variant/orientation/state                                  | Default     | Owner                  | Stability | Invalid-value behavior                                              |
| ---------- | ---------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- | ----------- | ---------------------- | --------- | ------------------------------------------------------------------- |
| Page       | integer from 1                                       | The current page.                                     | Always.                                                                    | required    | `component:Pagination` | Stable    | Not clamped; Previous and Next follow it.                           |
| Data shape | `totalItems`, `totalPages`, or `hasMore`             | Known item count, known page count, or cursor paging. | `totalPages` wins over the count derived from `totalItems`.                | unknown     | `component:Pagination` | Stable    | A zero or negative total renders nothing.                           |
| Variant    | `pages`, `count`, `compact`, `dots`, `input`, `none` | What sits between Previous and Next.                  | Indicators that need a total render nothing without one.                   | `pages`     | `component:Pagination` | Stable    | TypeScript rejects values absent from `PaginationVariantMap`.       |
| Step       | positive integer                                     | Pages Previous and Next move per press.               | Always.                                                                    | `1`         | `component:Pagination` | Stable    | A non-integer or value below 1 becomes 1.                           |
| Page size  | positive integer; optional option list               | Items per page; a selector when options are given.    | Always.                                                                    | `10`        | `component:Pagination` | Stable    | A non-finite size becomes 10; a fraction floors; below 1 becomes 1. |
| First/last | on, off                                              | Jump buttons flanking Previous and Next.              | `input` (on by default) and `compact` (off by default) with a known total. | per variant | `component:Pagination` | Stable    | Other variants ignore it.                                           |
| Size       | `sm`, `md`                                           | Control size.                                         | Always.                                                                    | `md`        | `component:Pagination` | Stable    | TypeScript rejects other values.                                    |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Basis                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| FR1  | The current render contains one Pagination landmark (`<nav>` named by `label`, else the localized "Pagination", unless a caller's `aria-labelledby` names it) and Previous/next buttons. Page-size selector, First/last buttons, Page number buttons, Ellipsis, Count readout, Compact readout, Dots, Page input label, Page input, and Page input total appear only when their existing conditions are met. Pagination renders nothing when `totalItems` or the resolved page count is zero or less.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source and tests                                                                                 |
| FR2  | Pagination, Dot, Page input label, and Page input total carry the four current local targets `pagination` (with `data-variant` and `data-size`), `pagination-dot` (`data-active`, `data-size`), `pagination-input-label` (`data-size`), and `pagination-input-total` (`data-size`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `architecture:component-theming-surface`; current source                                                 |
| FR3  | Page-size selector delegates to Selector; First/last, Previous/next, and Page number buttons delegate to Button; Count and Compact readouts delegate to Text; Page input delegates to NumberInput. The delegated Buttons carry `component:Button`'s gaps: their press scale applies under reduced motion (`design:reduced-motion` DR1) and their height is fixed (`spec:AST-102` FR4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source; `design:reduced-motion` DR1; `spec:AST-102` FR4                                          |
| FR4  | Ellipsis is stable visible Pagination-rendered content in a numbered presentation, hidden from assistive technology, and currently carries no public target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source                                                                                           |
| FR5  | The page count is `totalPages`, else `totalItems / pageSize` rounded up, else unknown. Previous is available above page 1; Next is available below the known count, or when `hasMore` with no count. Previous and Next move by `step`, clamped to 1 and the known count; First goes to 1 and Last to the count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current tests                                                                                            |
| FR6  | Every page change calls `onChange(page)`, announces "Page X of Y" (or "Page X" without a count) through the shared polite channel, and runs `changeAction(page)` in a transition while the optimistic page shows. A later change while one is pending starts a fresh transition. Pagination shows no other pending treatment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `spec:AST-086`; current tests                                                                            |
| FR7  | `pages` shows page buttons for the range when the count is known: every page when the count fits `5 + 2 × siblingCount` slots, otherwise, near an end, `3 + 2 × siblingCount` consecutive pages from that end, an ellipsis, and the other end (page 1 of 10 shows `1 2 3 4 5 … 10`); elsewhere the first page, an ellipsis, the current page with `siblingCount` neighbours, an ellipsis, and the last page. Each page button shows its number, is named "Go to page N", and the current one has `aria-current="page"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current tests                                                                                            |
| FR8  | `count` shows "X–Y of Z" for the visible item range (needs `totalItems`); `compact` shows "Page X of Y" (needs a count); `none` shows nothing between the buttons.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current tests                                                                                            |
| FR9  | With a known count, `dots` renders one dot button per page in a group named by the localized page-indicators label, as one composite single-choice control: a single roving Tab stop on the current dot; ArrowLeft and ArrowRight follow the reading direction (`design:bidirectionality` DR6) and wrap, Home and End reach the first and last dot, and focus landing on a dot selects its page; a click focuses the dot. While disabled, dots stay focusable with `aria-disabled` and change no page. Because the dots already play the APG radio group's role, they MUST expose its required parts: a `radiogroup` container and `radio` dots named by their page with `aria-checked` on the current one (`spec:AST-020` FR15, DEC-4); the arrow keys and Home/End are the composite's adopted extras. Implementation gap: the container is `role="group"` and the dots are buttons with `aria-current` on the current page. Under a coarse pointer each dot MUST gain an invisible hit area, clamped to half the gap between dots (`spec:AST-094` FR42). Implementation gap: dots are 8 px (6 px at `sm`) with no hit area. | `spec:AST-020` FR15, DEC-4; `spec:AST-094` FR42; `design:bidirectionality` DR6; current source and tests |
| FR10 | `input` renders the page label (visual only), a hidden-label integer NumberInput bounded to 1 and the count, and "/ N" when the count is known. Committing a different page changes to it; the input is disabled without a known count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `component:NumberInput`; current tests                                                                   |
| FR11 | With `pageSizeOptions`, a Selector labelled "Items per page" shows the options; choosing one calls `onPageSizeChange(size)` and then changes to page 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current tests                                                                                            |
| FR12 | Previous, Next, First, and Last name themselves with localized phrases (Previous and Next name the stride when `step` is above 1) and show that name as a tooltip only while available. Their chevrons mirror under RTL.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `architecture:internationalization`; current source and tests                                            |
| FR13 | `isDisabled` blocks every page change and disables every control. A disabled or boundary control MUST stay focusable with `aria-disabled` and keep focus when it becomes unavailable (`spec:AST-085` FR1, FR4, FR7). Implementation gap: dots and the page-size Selector use `aria-disabled`, but the Buttons use their native-disabled path, so a focused Previous, Next, First, or Last that reaches a boundary drops focus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `spec:AST-085`; current source and tests                                                                 |
| FR14 | `ref`, `className`, `style`, `xstyle`, `data-testid`, and other base props reach the landmark. A caller's `aria-label` never replaces the computed landmark name (`label`, else the localized default); other caller ARIA props, such as `aria-labelledby`, still reach the landmark. `data-testid` also reaches the input variant's NumberInput as `<id>-input`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current tests                                                                                            |

### Allowed variation

- **AV1 — Theme paint.** Themes may restyle the local targets; delegated
  controls follow their own targets.
- **AV2 — Custom variants.** None. The variant axis MUST be closed
  (`architecture:component-theming-surface` INV14). Implementation gap: the
  variant map is open to module augmentation, and an augmented variant renders
  Previous and Next only.

### Representative states

| State                | Required invariant                                                                                         | Allowed variation |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------- |
| First page           | Previous unavailable; Next available.                                                                      | Variant.          |
| Middle page, `pages` | Range with ellipses; current page `aria-current`.                                                          | `siblingCount`.   |
| Cursor paging        | No count; Next follows `hasMore`; count-only indicators hidden.                                            | —                 |
| Input variant        | Label, bounded input, total; First and Last by default.                                                    | `pageLabel`.      |
| Disabled             | No page change from any control. Implementation gap: native `disabled` on Buttons (FR13).                  | —                 |
| Dots                 | One Tab stop; arrows, Home, and End select. Implementation gap: group of buttons, not a radio group (FR9). | Size.             |
| Zero items           | Nothing renders.                                                                                           | —                 |

### Transformation and precedence order

- **ORD1 — Page count.** `totalPages`, then `ceil(totalItems / pageSize)`, then
  unknown.
- **ORD2 — Page change.** Disabled guard → `onChange` → announcement →
  optimistic page and `changeAction`.
- **ORD3 — First/last.** `hasFirstLast` for `input` (default on) and `compact`
  (default off); omitted without a known count.

### Performance and resources

- **PR1 — Bounded resources.** The dots share one roving-focus handler on
  their group. The delegated Buttons add the press controller's shared window
  and document listeners; each tooltip's `interactionRef` adds pointer and focus
  listeners on its Button, and the Tooltip layer installs the shared
  gesture-counter document listeners once per page.

## Accessibility contract

- **AR1 — Landmark.** A named `nav` landmark (FR1).
- **AR2 — Current page.** `aria-current="page"` on the current page button
  (FR7). The dots MUST expose the current page with `aria-checked` in a radio
  group; FR9 records the gap.
- **AR3 — Announcement.** FR6.
- **AR4 — Disabled and boundaries.** FR13.
- **AR5 — Decorative parts.** The ellipsis and the input variant's page label
  are hidden from assistive technology; the input is named by its hidden label.

## Design relationships

| Anatomy or state      | Design requirement                                                 | Representation authority       | Hierarchy role | Component contract |
| --------------------- | ------------------------------------------------------------------ | ------------------------------ | -------------- | ------------------ |
| Pagination            | Groups the page-size and paging controls in a navigation landmark. | Current source and public docs | Supporting     | FR1, FR2           |
| Page-size selector    | Lets people choose the number of items shown per page.             | `component:Selector`           | Supporting     | FR3, FR11          |
| First/last buttons    | Jump directly to the first or last known page.                     | `component:Button`             | Supporting     | FR3, FR5, FR12     |
| Previous/next buttons | Move backward or forward through pages.                            | `component:Button`             | Prominent      | FR3, FR5, FR12     |
| Page number button    | Selects one page directly in the numbered presentation.            | `component:Button`             | Prominent      | FR3, FR7           |
| Ellipsis              | Indicates an omitted span of page numbers.                         | Current source and public docs | Supporting     | FR4, FR7           |
| Count readout         | Presents the visible item range and total.                         | `component:Text`               | Prominent      | FR3, FR8           |
| Compact readout       | Presents the current and total page counts.                        | `component:Text`               | Prominent      | FR3, FR8           |
| Dot                   | Presents and selects one page in the dot presentation.             | Current source and public docs | Prominent      | FR2, FR9           |
| Page input label      | Names the editable page field visually.                            | Current source and public docs | Supporting     | FR2, FR10          |
| Page input            | Accepts a direct page-number entry.                                | `component:NumberInput`        | Prominent      | FR3, FR10          |
| Page input total      | Presents the known total after the editable page field.            | Current source and public docs | Supporting     | FR2, FR10          |

The three Button rows are separate stable controls with different conditions and
jobs; they do not create Pagination-owned Button targets. Presentation values,
size, disabled state, and active state remain capabilities on owning targets,
not anatomy entries.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Pagination": {"target": "pagination"},
  "Page-size selector": {
    "delegatesTo": {"owner": "component:Selector", "target": "selector"}
  },
  "First/last buttons": {
    "delegatesTo": {"owner": "component:Button", "target": "button"}
  },
  "Previous/next buttons": {
    "delegatesTo": {"owner": "component:Button", "target": "button"}
  },
  "Page number button": {
    "delegatesTo": {"owner": "component:Button", "target": "button"}
  },
  "Ellipsis": {
    "none": {
      "reason": "unsettled: no current public target is applied to the Pagination-rendered ellipsis"
    }
  },
  "Count readout": {
    "delegatesTo": {"owner": "component:Text", "target": "text"}
  },
  "Compact readout": {
    "delegatesTo": {"owner": "component:Text", "target": "text"}
  },
  "Dot": {"target": "pagination-dot"},
  "Page input label": {"target": "pagination-input-label"},
  "Page input": {
    "delegatesTo": {"owner": "component:NumberInput", "target": "number-input"}
  },
  "Page input total": {"target": "pagination-input-total"}
}
```

The four local targets are current public seams. Delegated controls retain their
component owners. Ellipsis has no current target; that factual `none` disposition
does not decide whether it should remain unreachable.

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, local
  target mapping, delegation, state placement, and factual `none` dispositions.
- Button, Text, NumberInput, and Selector retain ownership of their delegated
  targets and presentation.
- `spec:AST-085` owns disabled focusability; FR13 records the gap.
- `spec:AST-020` FR15 owns which APG parts the dots adopt; FR9 records the gap.
- `spec:AST-094` FR42 owns coarse-pointer hit areas; FR9 records the gap.
- `spec:AST-086` owns the page announcement channel.

## Verification map

| Contract            | Verification                                                                                                                                                                                                                                                                                                                                                                                     | Representative states                                                                            | Mutation or failure expectation                                                                                                                                                                                                                                                                                              | Audit section                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| FR1, FR14           | `Pagination.test.tsx` basic-rendering, zero-item, and rest-forwarding cases                                                                                                                                                                                                                                                                                                                      | Default and custom label; zero items or pages; `data-testid`, `id`, `aria-describedby`           | A missing or misnamed landmark, a render at zero, or a dropped `data-testid`, `id`, or `aria-*` fails. Evidence gap: no test asserts `ref`, `className`, `style`, `xstyle`, the computed `aria-label` replacing a caller's, a caller's `aria-labelledby` reaching the landmark, or the input variant's `<id>-input` test id. | `audit:Pagination/anatomy`       |
| FR2                 | `themingTargets.test.ts`                                                                                                                                                                                                                                                                                                                                                                         | Rendered targets                                                                                 | A rendered class absent from the documented targets fails. Evidence gap: no test asserts the placement or reflected properties of the four local targets (OQ1).                                                                                                                                                              | `audit:Pagination/theming`       |
| FR3                 | `Pagination.test.tsx` "does not introduce Stack theme targets around navigation controls"                                                                                                                                                                                                                                                                                                        | Navigation controls                                                                              | An added Stack target fails. Evidence gap: no test asserts each delegated owner; the delegated Button gaps are asserted by `component:Button`'s own records, not here.                                                                                                                                                       | `audit:Pagination/theming`       |
| FR4, FR7            | `generatePageRange` cases; `Pagination.test.tsx` pages cases ("renders page number buttons", "marks current page with aria-current", "shows ellipsis for many pages")                                                                                                                                                                                                                            | Left, right, and two-sided omission; `siblingCount` 0 and 2                                      | A wrong range, a missing ellipsis, or a missing `aria-current` fails. Evidence gap: no test asserts that the ellipsis is hidden from assistive technology.                                                                                                                                                                   | `audit:Pagination/behavior`      |
| FR5, ORD1           | `Pagination.test.tsx` boundary, cursor, step, page-size guarding, and totalItems cases                                                                                                                                                                                                                                                                                                           | First, middle, last, single page; `hasMore`; step clamp; invalid `pageSize`                      | A move past a bound or a wrong count derived from `totalItems` and `pageSize` fails. Evidence gap: no test passes both `totalItems` and `totalPages`, so ORD1's precedence is untested.                                                                                                                                      | `audit:Pagination/behavior`      |
| FR6, ORD2           | `Pagination.test.tsx` page-change and changeAction cases                                                                                                                                                                                                                                                                                                                                         | Mount, page button, Previous, Next, dot; pending, interrupted, and synchronous Actions; disabled | A missing `onChange`, announcement, or optimistic page, a `changeAction` before `onChange`, or an Action while disabled fails. Evidence gap: no test asserts the announcement's order relative to `onChange`.                                                                                                                | `audit:Pagination/behavior`      |
| FR8                 | `Pagination.test.tsx` count and compact cases                                                                                                                                                                                                                                                                                                                                                    | Count range and last-page clamp; compact text                                                    | A wrong readout fails.                                                                                                                                                                                                                                                                                                       | `audit:Pagination/behavior`      |
| FR9                 | `Pagination.test.tsx` dots cases ("uses roving tabindex — active dot has tabIndex 0, others -1", "ArrowRight moves focus to the next dot and selects it", "Home selects the first page, End the last", the wrap cases, "does not navigate with arrow keys when disabled", "marks active dot with aria-current" asserting the current gap pending conformance); `useListFocus.test.tsx` RTL cases | Dots; RTL; disabled                                                                              | A second Tab stop, an arrow or Home/End that does not select, a missing wrap, a disabled dot that drops focus or changes page, or reversed RTL arrows fail. Evidence gap: no Pagination-level RTL dots test and no coarse-pointer hit-area test.                                                                             | `audit:Pagination/accessibility` |
| FR10                | `Pagination.test.tsx` input and pageLabel cases                                                                                                                                                                                                                                                                                                                                                  | Known and unknown totals; Enter, blur, invalid, below and above range; custom label; disabled    | A wrong bound, a missing commit or announcement, or a commit while disabled fails.                                                                                                                                                                                                                                           | `audit:Pagination/behavior`      |
| FR11                | `Pagination.test.tsx` page-size selector cases                                                                                                                                                                                                                                                                                                                                                   | With and without `pageSizeOptions`                                                               | Evidence gap: the page-size cases only check that the landmark and buttons render, so no test asserts the Selector's presence or absence, `onPageSizeChange`, or the reset to page 1.                                                                                                                                        | `audit:Pagination/behavior`      |
| FR12, ORD3          | `Pagination.test.tsx` first/last, step-name, tooltip, and RTL chevron cases                                                                                                                                                                                                                                                                                                                      | `hasFirstLast` on `compact` and `input`; stride names; RTL                                       | A wrong name, a missing First or Last, a Previous or Next without a tooltip, or a First or Last chevron that does not mirror like Previous and Next fails. Evidence gap: no test asserts the tooltip text, that the tooltip is absent while a control is unavailable, or that the chevrons mirror under RTL.                 | `audit:Pagination/accessibility` |
| FR13                | `Pagination.test.tsx` disabled-state and boundary cases, asserting native `disabled` on the Buttons as the current gap pending conformance                                                                                                                                                                                                                                                       | Disabled; first and last page                                                                    | A page change while disabled fails. Evidence gap: no test asserts focus kept at a boundary.                                                                                                                                                                                                                                  | `audit:Pagination/accessibility` |
| PR1, AR1–AR5        | PR1 has no test (evidence gap). AR1 to AR5 are covered by the FR1, FR6, FR7, FR9, FR10, and FR13 rows.                                                                                                                                                                                                                                                                                           | —                                                                                                | —                                                                                                                                                                                                                                                                                                                            | `audit:Pagination/accessibility` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                    | Canonical anatomy and current targets                                                            | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                                                | `audit:Pagination/theming`       |

## Current-state impact

- **Dots semantics (FR9).** The dots act as one single-choice control but are
  exposed as a group of buttons with `aria-current`, not a radio group, against
  `spec:AST-020` FR15.
- **Dot hit area (FR9).** Dots are 8 px (6 px at `sm`) with no coarse-pointer
  hit area, against `spec:AST-094` FR42.
- **Open variant axis (AV2).** The variant map accepts module-augmented
  values, which render Previous and Next only, against
  `architecture:component-theming-surface` INV14.
- **Page-count docs (FR5, ORD1).** `totalPages` wins over the count derived
  from `totalItems`, while the prop documentation says `totalItems` takes
  precedence when both are given.
- **Delegated Button gaps (FR3).** The page and navigation Buttons scale on a
  press under reduced motion and hold a fixed height, as `component:Button`
  records, against `design:reduced-motion` DR1 and `spec:AST-102` FR4.
- **Boundary and disabled focus (FR13).** Previous, Next, First, Last, and page
  buttons use native `disabled`, so a keyboard user on Next at the last page
  loses focus, against `spec:AST-085` FR1, FR4, and FR7.

## Decision log

No component-local decision.

## Open questions

- **OQ1 — Which focused tests should pin placement and reflected properties for
  the four local Pagination targets?** (`checkable`)
- **OQ2 — Should Ellipsis gain a stable public theming target?** (`human-api`)
  Its current lack of reachability does not decide the answer.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or system rules. It links to their owners.
