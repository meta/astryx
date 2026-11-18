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
    packages/core/src/Pagination/__tests__/PaginationLinks.a11y.browser.spec.ts,
    packages/core/src/Pagination/__tests__/PaginationTextSize.interaction.browser.spec.ts,
    packages/core/src/RadioList/__tests__/RadioGroup.a11y.test.tsx,
    packages/core/src/RadioList/__tests__/RadioGroup.a11y.chromium.spec.ts,
    packages/core/src/hooks/useListFocus.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:navigation-destinations]
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

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Pagination takes `page`, `onChange`, `changeAction`, `getPageHref`, `as`, `totalItems`, `totalPages`, `hasMore`, `pageSize`, `pageSizeOptions`, `onPageSizeChange`, `variant`, `pageLabel`, `hasFirstLast`, `step`, `siblingCount`, `size`, `isDisabled`, `label`, and base props.                                                                 |
| Behavior                | A labelled navigation landmark with Previous and Next buttons around a variant-specific indicator. Every page change calls `onChange`, announces the new page, and runs an optional `changeAction` with an optimistic page. With `getPageHref`, the Button controls are links to each page's URL (FR16).                                           |
| End-user impact         | People move through pages by buttons, page numbers, dots, or typing a page, and screen-reader users hear the page they landed on. A page link opens in a new tab, and its address can be copied. A control that becomes unavailable while it holds focus keeps that focus, as a button or as a link (FR13, FR19).                                  |
| Builder impact          | With `getPageHref` the Button controls are links, and `onChange` still runs for them, so the caller does not navigate there (FR17). The dots, the page box, and the page-size selector stay controls (FR18).                                                                                                                                       |
| Compatibility/readiness | Additive: `getPageHref` and `as` are optional, and `onChange` keeps its released type (DEC-3). No default changes. The dots render as a `radiogroup` of `radio` dots (FR9), a DOM and accessibility-tree change. The dots have no coarse-pointer hit area, and delegated Buttons carry their own gaps; both are listed under Current-state impact. |
| Review checks           | Reject a page change outside 1 to the total, a page change without an announcement, a disabled Pagination that changes page, a landmark without a name, a delegated control re-themed by Pagination, a link on a disabled or unavailable control, or a page change from a click that the browser opens elsewhere.                                  |
| Governing rules         | `spec:AST-020` FR15, DEC-4; `spec:AST-085` FR1, FR4, FR7; `spec:AST-086`; `spec:AST-094` FR42; `spec:AST-102` FR4; `family:navigation-destinations`; `component:Button` FR11; `design:bidirectionality` DR6; `design:reduced-motion` DR1; `architecture:component-theming-surface`; `architecture:internationalization` INV1a.                     |

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
- Compatibility class: additive; `getPageHref` and `as` are optional props,
  and `onChange` keeps its released type (DEC-3); the dots' DOM changes from a
  `group` of `button`s named "Go to page N" with `aria-current="page"` to a
  `radiogroup` of `radio` dots named "Page N" with `aria-checked` (FR9)
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
- The link element of a page link and the acceptance of its destination —
  owned by `component:Button` and `family:navigation-destinations`.
- Navigation: a page link's link component navigates (FR17), and the caller
  navigates for the dots, the Page input, and the Page-size selector.

## Public concepts

| Concept    | Closed values or states                              | Meaning                                               | Availability by variant/orientation/state                                  | Default     | Owner                  | Stability | Invalid-value behavior                                              |
| ---------- | ---------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- | ----------- | ---------------------- | --------- | ------------------------------------------------------------------- |
| Page       | integer from 1                                       | The current page.                                     | Always.                                                                    | required    | `component:Pagination` | Stable    | Not clamped; Previous and Next follow it.                           |
| Data shape | `totalItems`, `totalPages`, or `hasMore`             | Known item count, known page count, or cursor paging. | `totalPages` wins over the count derived from `totalItems`.                | unknown     | `component:Pagination` | Stable    | A zero or negative total renders nothing.                           |
| Variant    | `pages`, `count`, `compact`, `dots`, `input`, `none` | What sits between Previous and Next.                  | Indicators that need a total render nothing without one.                   | `pages`     | `component:Pagination` | Stable    | TypeScript rejects values absent from `PaginationVariantMap`.       |
| Step       | positive integer                                     | Pages Previous and Next move per press.               | Always.                                                                    | `1`         | `component:Pagination` | Stable    | A non-integer or value below 1 becomes 1.                           |
| Page size  | positive integer; optional option list               | Items per page; a selector when options are given.    | Always.                                                                    | `10`        | `component:Pagination` | Stable    | A non-finite size becomes 10; a fraction floors; below 1 becomes 1. |
| First/last | on, off                                              | Jump buttons flanking Previous and Next.              | `input` (on by default) and `compact` (off by default) with a known total. | per variant | `component:Pagination` | Stable    | Other variants ignore it.                                           |
| Page links | off, on                                              | The Button controls are links to each page's URL.     | On with `getPageHref`; a disabled or unavailable control stays a button.   | off         | `component:Pagination` | Stable    | A rejected URL renders inertly (`family:navigation-destinations`).  |
| Size       | `sm`, `md`                                           | Control size.                                         | Always.                                                                    | `md`        | `component:Pagination` | Stable    | TypeScript rejects other values.                                    |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Basis                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| FR1  | The current render contains one Pagination landmark (`<nav>` named by `label`, else the localized "Pagination", unless a caller's `aria-labelledby` names it) and Previous/next buttons. Page-size selector, First/last buttons, Page number buttons, Ellipsis, Count readout, Compact readout, Dots, Page input label, Page input, and Page input total appear only when their existing conditions are met. Pagination renders nothing when `totalItems` or the resolved page count is zero or less.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Current source and tests                                                                                 |
| FR2  | Pagination, Dot, Page input label, and Page input total carry the four current local targets `pagination` (with `data-variant` and `data-size`), `pagination-dot` (`data-active`, `data-size`), `pagination-input-label` (`data-size`), and `pagination-input-total` (`data-size`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `architecture:component-theming-surface`; current source                                                 |
| FR3  | Page-size selector delegates to Selector; First/last, Previous/next, and Page number buttons delegate to Button; Count and Compact readouts delegate to Text; Page input delegates to NumberInput. Page number buttons grow with their label as `component:Button` FR4 says, and Ellipsis takes its size as a minimum height, so both grow with a larger text size and a wrapped row never covers another (`spec:AST-102` FR4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source; `component:Button` FR4; `spec:AST-102` FR4                                               |
| FR4  | Ellipsis is stable visible Pagination-rendered content in a numbered presentation, hidden from assistive technology, and currently carries no public target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source                                                                                           |
| FR5  | The page count is `totalPages`, else `totalItems / pageSize` rounded up, else unknown. Previous is available above page 1; Next is available below the known count, or when `hasMore` with no count. Previous and Next move by `step`, clamped to 1 and the known count; First goes to 1 and Last to the count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current tests                                                                                            |
| FR6  | Every page change calls `onChange(page)`, announces "Page X of Y" (or "Page X" without a count) through the shared polite channel, and runs `changeAction(page)` in a transition while the optimistic page shows. A later change while one is pending starts a fresh transition. Pagination shows no other pending treatment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `spec:AST-086`; current tests                                                                            |
| FR7  | `pages` shows page buttons for the range when the count is known: every page when the count fits `5 + 2 × siblingCount` slots, otherwise, near an end, `3 + 2 × siblingCount` consecutive pages from that end, an ellipsis, and the other end (page 1 of 10 shows `1 2 3 4 5 … 10`); elsewhere the first page, an ellipsis, the current page with `siblingCount` neighbours, an ellipsis, and the last page. Each page button shows its number, is named "Go to page N", and the current one has `aria-current="page"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current tests                                                                                            |
| FR8  | `count` shows "X–Y of Z" for the visible item range (needs `totalItems`); `compact` shows "Page X of Y" (needs a count); `none` shows nothing between the buttons.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current tests                                                                                            |
| FR9  | With a known count, `dots` renders one dot per page in a radio group named by the localized page-indicators label, as one composite single-choice control: a single roving Tab stop on the current dot; ArrowLeft and ArrowRight follow the reading direction (`design:bidirectionality` DR6) and wrap, Home and End reach the first and last dot, and focus landing on a dot selects its page; a press does not focus a dot, and the click on release focuses it, so a press released away selects nothing (WCAG 2.5.2). While disabled, dots stay focusable with `aria-disabled` and change no page. Because the dots already play the APG radio group's role, they MUST expose its required parts: a `radiogroup` container and `radio` dots named by their page with `aria-checked` on the current one (`spec:AST-020` FR15, DEC-4); the arrow keys and Home/End are the composite's adopted extras. Under a coarse pointer each dot MUST gain an invisible hit area, clamped to half the gap between dots (`spec:AST-094` FR42). Implementation gap: dots are 8 px (6 px at `sm`) with no hit area. | `spec:AST-020` FR15, DEC-4; `spec:AST-094` FR42; `design:bidirectionality` DR6; current source and tests |
| FR10 | `input` renders the page label (visual only), a hidden-label integer NumberInput bounded to 1 and the count, and "/ N" when the count is known. Committing a different page changes to it; the input is disabled without a known count. A rejected entry (`spec:AST-118`) stays in the page box and shows its message on the box's status icon (`statusVariant="tooltip"`), so the bar keeps its height; while the rejection stands, the box widens by `--spacing-10` so the typed text stays visible beside the icon.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `component:NumberInput`; current tests                                                                   |
| FR11 | With `pageSizeOptions`, a Selector labelled "Items per page" shows the options; choosing one calls `onPageSizeChange(size)` and then changes to page 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current tests                                                                                            |
| FR12 | Previous, Next, First, and Last name themselves with localized phrases (Previous and Next name the stride when `step` is above 1) and show that name as a tooltip only while available. Their chevrons mirror under RTL.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `architecture:internationalization`; current source and tests                                            |
| FR13 | `isDisabled` blocks every page change and disables every control. A disabled or boundary control MUST stay focusable with `aria-disabled` and keep focus when it becomes unavailable (`spec:AST-085` FR1, FR4, FR7). The Buttons, the dots, and the page-size Selector use `aria-disabled` and no native `disabled`, so a focused Previous, Next, First, or Last button that reaches a boundary keeps focus (`component:Button` FR10). A page link keeps focus too (FR19).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `spec:AST-085`; current source and tests                                                                 |
| FR14 | `ref`, `className`, `style`, `xstyle`, `data-testid`, and other base props reach the landmark. A caller's `aria-label` never replaces the computed landmark name (`label`, else the localized default); other caller ARIA props, such as `aria-labelledby`, still reach the landmark. `data-testid` also reaches the input variant's NumberInput as `<id>-input`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current tests                                                                                            |
| FR15 | When its controls do not fit the available width, as at a larger text size, the row wraps onto more lines in reading order, so every control stays on screen (`spec:AST-102` FR4); Previous and First stay first and Next and Last stay last in reading order. Beside other content in a flex row, the landmark can shrink to its widest control and wrap at any text size.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `spec:AST-102` FR4; current source and tests                                                             |
| FR16 | With `getPageHref`, each available Page number, Previous, Next, First, and Last button is a link: Pagination gives its Button `href={getPageHref(page, pageSize)}` and `as`, and Button renders the link (`component:Button` FR11). `page` is the page that the control changes to under FR5. `pageSize` is the resolved page size when the caller supplies `pageSize` or `pageSizeOptions`, and `undefined` otherwise. The current page's link has `aria-current="page"`. A control that FR5 makes unavailable, and every control while `isDisabled`, is a disabled button with no link, and Pagination requests no URL for it. In cursor paging Previous and Next request the page `step` before and after the current one, and the caller maps that page to its cursor's URL.                                                                                                                                                                                                                                                                                                                         | DEC-1; `component:Button` FR11; `family:navigation-destinations`; current tests                          |
| FR17 | A plain activation of a page link runs FR6, with the same `onChange(page)` call as a button control. Pagination does not cancel the click, so the link navigates, and the caller does not navigate in `onChange` for it. The browser follows the URL that was activated: the page change gives a Previous or Next link its next URL only after the click is over. A click that does not navigate this document runs none of FR6, because the page here did not change: a click with a modifier key (Control, Meta, Shift, or Alt), a click on a link whose `target` is set and is not `_self`, and a click on a link whose URL is rejected.                                                                                                                                                                                                                                                                                                                                                                                                                                                              | DEC-1; DEC-3; current tests                                                                              |
| FR18 | The dots (FR9), the Page input (FR10), and the Page-size selector (FR11) are never links (DEC-2). With `getPageHref` they keep FR9 to FR11 and change the page through FR6. In the `dots` and `input` variants only Previous, Next, First, and Last are links. `onChange` receives the page alone from every control (DEC-3), so it does not tell a link, which navigates, from a dot or the Page input, which do not. A page-size choice calls `onPageSizeChange(size)` and then `onChange(1)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | DEC-2; DEC-3; current tests                                                                              |
| FR19 | Button replaces the element of a control that stops or starts being a link (`component:Button` FR11): a link that becomes unavailable, at a boundary or while `isDisabled`, is a disabled button, and that button is a link when the control is available again. When the element that leaves holds focus, Pagination moves the focus to the element that replaces it in the same change, through Core's shared owner of that replacement (`architecture:react-component-runtime` INV16). The focus indicator follows the last input: it shows after a key press and not after a pointer press (`architecture:interaction-modality` INV1). The control then holds focus as a button control does (FR13; `spec:AST-085` FR4, FR7). Pagination moves no focus for a control that did not hold it, and none when another element holds focus after the change.                                                                                                                                                                                                                                              | `spec:AST-085` FR4, FR7; `component:Button` FR11; current source and tests                               |

### Allowed variation

- **AV1 — Theme paint.** Themes may restyle the local targets; delegated
  controls follow their own targets.
- **AV2 — Custom variants.** None. The variant axis MUST be closed
  (`architecture:component-theming-surface` INV14). Implementation gap: the
  variant map is open to module augmentation, and an augmented variant renders
  Previous and Next only.

### Representative states

| State                | Required invariant                                                                        | Allowed variation |
| -------------------- | ----------------------------------------------------------------------------------------- | ----------------- |
| First page           | Previous unavailable; Next available.                                                     | Variant.          |
| Middle page, `pages` | Range with ellipses; current page `aria-current`.                                         | `siblingCount`.   |
| Cursor paging        | No count; Next follows `hasMore`; count-only indicators hidden.                           | —                 |
| Input variant        | Label, bounded input, total; First and Last by default.                                   | `pageLabel`.      |
| Disabled             | No page change from any control; Buttons and dots stay focusable (`aria-disabled`, FR13). | —                 |
| Dots                 | One Tab stop; arrows, Home, and End select. A radio group of page radios (FR9).           | Size.             |
| Page links           | Available Button controls are links; the current page has `aria-current="page"` (FR16).   | Link component.   |
| Page links, dots     | Previous and Next are links; the dots stay a radio group (FR18).                          | —                 |
| Zero items           | Nothing renders.                                                                          | —                 |

### Transformation and precedence order

- **ORD1 — Page count.** `totalPages`, then `ceil(totalItems / pageSize)`, then
  unknown.
- **ORD2 — Page change.** Disabled guard → `onChange` → announcement →
  optimistic page and `changeAction`. A page link then navigates (FR17).
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
  or link (FR7, FR16). The dots expose the current page with `aria-checked` in
  a radio group (FR9).
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
- `spec:AST-085` owns disabled focusability; FR13 and FR19 apply it to the
  controls.
- `spec:AST-020` FR15 owns which APG parts the dots adopt (FR9).
- `spec:AST-094` FR42 owns coarse-pointer hit areas; FR9 records the gap.
- `spec:AST-086` owns the page announcement channel.
- `family:navigation-destinations` owns the acceptance of a page link's
  destination. `component:Button` FR11 owns the link element, its disabled
  fallback, and the replacement of one by the other (FR16). Pagination owns the
  focus of its own control across that replacement (FR19).

## Verification map

| Contract            | Verification                                                                                                                                                                                                                                                                                                                                                                                                                           | Representative states                                                                                                                                          | Mutation or failure expectation                                                                                                                                                                                                                                                                                              | Audit section                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| FR1, FR14           | `Pagination.test.tsx` basic-rendering, zero-item, and rest-forwarding cases                                                                                                                                                                                                                                                                                                                                                            | Default and custom label; zero items or pages; `data-testid`, `id`, `aria-describedby`                                                                         | A missing or misnamed landmark, a render at zero, or a dropped `data-testid`, `id`, or `aria-*` fails. Evidence gap: no test asserts `ref`, `className`, `style`, `xstyle`, the computed `aria-label` replacing a caller's, a caller's `aria-labelledby` reaching the landmark, or the input variant's `<id>-input` test id. | `audit:Pagination/anatomy`       |
| FR2                 | `themingTargets.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                               | Rendered targets                                                                                                                                               | A rendered class absent from the documented targets fails. Evidence gap: no test asserts the placement or reflected properties of the four local targets (OQ1).                                                                                                                                                              | `audit:Pagination/theming`       |
| FR3                 | `Pagination.test.tsx` "does not introduce Stack theme targets around navigation controls"                                                                                                                                                                                                                                                                                                                                              | Navigation controls                                                                                                                                            | An added Stack target fails. Evidence gap: no test asserts each delegated owner; the delegated Button gaps are asserted by `component:Button`'s own records, not here.                                                                                                                                                       | `audit:Pagination/theming`       |
| FR4, FR7            | `generatePageRange` cases; `Pagination.test.tsx` pages cases ("renders page number buttons", "marks current page with aria-current", "shows ellipsis for many pages")                                                                                                                                                                                                                                                                  | Left, right, and two-sided omission; `siblingCount` 0 and 2                                                                                                    | A wrong range, a missing ellipsis, or a missing `aria-current` fails. Evidence gap: no test asserts that the ellipsis is hidden from assistive technology.                                                                                                                                                                   | `audit:Pagination/behavior`      |
| FR5, ORD1           | `Pagination.test.tsx` boundary, cursor, step, page-size guarding, and totalItems cases                                                                                                                                                                                                                                                                                                                                                 | First, middle, last, single page; `hasMore`; step clamp; invalid `pageSize`                                                                                    | A move past a bound or a wrong count derived from `totalItems` and `pageSize` fails. Evidence gap: no test passes both `totalItems` and `totalPages`, so ORD1's precedence is untested.                                                                                                                                      | `audit:Pagination/behavior`      |
| FR6, ORD2           | `Pagination.test.tsx` page-change and changeAction cases                                                                                                                                                                                                                                                                                                                                                                               | Mount, page button, Previous, Next, dot; pending, interrupted, and synchronous Actions; disabled                                                               | A missing `onChange`, announcement, or optimistic page, a `changeAction` before `onChange`, or an Action while disabled fails. Evidence gap: no test asserts the announcement's order relative to `onChange`.                                                                                                                | `audit:Pagination/behavior`      |
| FR8                 | `Pagination.test.tsx` count and compact cases                                                                                                                                                                                                                                                                                                                                                                                          | Count range and last-page clamp; compact text                                                                                                                  | A wrong readout fails.                                                                                                                                                                                                                                                                                                       | `audit:Pagination/behavior`      |
| FR9                 | `Pagination.test.tsx` dots cases ("uses roving tabindex — active dot has tabIndex 0, others -1", "ArrowRight moves focus to the next dot and selects it", "Home selects the first page, End the last", the wrap cases, "does not navigate with arrow keys when disabled", the radio-group parts through `RadioGroup.a11y.test.tsx` and `RadioGroup.a11y.chromium.spec.ts` (Pagination dots states)); `useListFocus.test.tsx` RTL cases | Dots; RTL; disabled                                                                                                                                            | A second Tab stop, an arrow or Home/End that does not select, a missing wrap, a disabled dot that drops focus or changes page, or reversed RTL arrows fail. Evidence gap: no Pagination-level RTL dots test and no coarse-pointer hit-area test.                                                                             | `audit:Pagination/accessibility` |
| FR10                | `Pagination.test.tsx` input and pageLabel cases                                                                                                                                                                                                                                                                                                                                                                                        | Known and unknown totals; Enter, blur, invalid, below and above range; custom label; disabled; a rejected entry kept with the tooltip status and the wider box | A wrong bound, a missing commit or announcement, a commit while disabled, or a rejected entry that hides its text or shows a message box fails.                                                                                                                                                                              | `audit:Pagination/behavior`      |
| FR11                | `Pagination.test.tsx` page-size selector cases                                                                                                                                                                                                                                                                                                                                                                                         | With and without `pageSizeOptions`                                                                                                                             | Evidence gap: the page-size cases only check that the landmark and buttons render, so no test asserts the Selector's presence or absence, `onPageSizeChange`, or the reset to page 1.                                                                                                                                        | `audit:Pagination/behavior`      |
| FR12, ORD3          | `Pagination.test.tsx` first/last, step-name, tooltip, and RTL chevron cases                                                                                                                                                                                                                                                                                                                                                            | `hasFirstLast` on `compact` and `input`; stride names; RTL                                                                                                     | A wrong name, a missing First or Last, a Previous or Next without a tooltip, a tooltip on an unavailable or disabled control, or a First or Last chevron that does not mirror like Previous and Next fails. Evidence gap: no test asserts that the chevrons mirror under RTL.                                                | `audit:Pagination/accessibility` |
| FR13                | `Pagination.test.tsx` disabled-state and boundary cases, asserting `aria-disabled` on the Buttons and focus kept on Next at the last page; `PaginationLinks.a11y.browser.spec.ts` in Chromium and WebKit (a button control at the last page)                                                                                                                                                                                           | Disabled; first and last page                                                                                                                                  | A page change while disabled, a natively disabled Button, or focus lost from a button control at a boundary fails.                                                                                                                                                                                                           | `audit:Pagination/accessibility` |
| FR3, FR15           | `PaginationTextSize.interaction.browser.spec.ts` at a 402 px viewport and 100%, 165%, 194% and 312% default font size                                                                                                                                                                                                                                                                                                                  | Pages; narrow viewport; default text size                                                                                                                      | A page that scrolls sideways, a control off screen, Previous not first or Next not last in reading order, a second row at 100%, or a page number or ellipsis outside its box at 312% fails.                                                                                                                                  | `audit:Pagination/accessibility` |
| FR16, FR17          | `Pagination.test.tsx` page-links cases; `PaginationLinks.a11y.browser.spec.ts` (the URL that the browser follows)                                                                                                                                                                                                                                                                                                                      | Each Button control; step; page-size argument; `as` and `LinkProvider`; boundary, disabled, and cursor; plain, modified, and `target` clicks; a rejected URL   | A missing link, a URL for an unavailable control, a wrong page size, an ignored `as` or `LinkProvider`, a followed URL other than the activated one, a link click without one `onChange(page)`, or a page change from a modified, other-`target`, or rejected-URL click fails. Evidence gap: no real-browser modified click. | `audit:Pagination/behavior`      |
| FR18                | `Pagination.test.tsx` page-links cases for the dots, the page box, and the selector                                                                                                                                                                                                                                                                                                                                                    | `dots` and `input` with `getPageHref`; a page-size choice                                                                                                      | A dot or page box that renders a link or does not call `onChange(page)`, or a page-size choice that reports out of order, fails.                                                                                                                                                                                             | `audit:Pagination/behavior`      |
| FR19                | `Pagination.test.tsx` cases under "focus on a control that stops or starts being a link"; `PaginationLinks.a11y.browser.spec.ts` in Chromium and WebKit                                                                                                                                                                                                                                                                                | Each Button control at a boundary; `isDisabled` on and off; a caller-set page; a page that arrives late; a link component; focus elsewhere; key and pointer    | Focus on the document body after a focused control stops or starts being a link fails. Focus taken by a control that did not hold it fails. A focus ring after a pointer press fails.                                                                                                                                        | `audit:Pagination/accessibility` |
| PR1, AR1–AR5        | PR1 has no test (evidence gap). AR1 to AR5 are covered by the FR1, FR6, FR7, FR9, FR10, and FR13 rows.                                                                                                                                                                                                                                                                                                                                 | —                                                                                                                                                              | —                                                                                                                                                                                                                                                                                                                            | `audit:Pagination/accessibility` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                                                          | Canonical anatomy and current targets                                                                                                                          | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                                                | `audit:Pagination/theming`       |

## Current-state impact

- **Dot hit area (FR9).** Dots are 8 px (6 px at `sm`) with no coarse-pointer
  hit area, against `spec:AST-094` FR42.
- **Open variant axis (AV2).** The variant map accepts module-augmented
  values, which render Previous and Next only, against
  `architecture:component-theming-surface` INV14.
- **Page-count docs (FR5, ORD1).** `totalPages` wins over the count derived
  from `totalItems`, while the prop documentation says `totalItems` takes
  precedence when both are given.
- **Navigation Button height (FR3).** Previous, Next, First, and Last keep a
  fixed square while their chevrons grow with a larger text size, against
  `spec:AST-102` FR4.

## Decision log

### DEC-1 — A URL function makes the page links

**Reference:** `component:Pagination/DEC-1`
**Decider:** `nynexman4464`, `2026-11-13`

`getPageHref(page, pageSize)` returns each page's URL, because only the caller
knows how its application addresses a page: a query parameter, a path segment,
an offset, or a cursor. The page size is the second argument and is optional,
as `pageSize` is on the control. `as` chooses the link component as it does on
Button and Tab (FR16). `onChange` runs for a page change made through a link,
as it does for a button control (FR17).

Rejected: one `href` with a page parameter, because applications name and place
their pagination parameters differently.

### DEC-2 — The dots, the Page input, and the Page-size selector are not links

**Reference:** `component:Pagination/DEC-2`
**Decider:** `nynexman4464`, `2026-11-13`

A link names one destination before a person activates it. The dots are a radio
group in which focus selects the page (FR9), so a dot that is a link navigates
on each arrow key. The Page input and the Page-size selector take a typed or
chosen value, so they have no destination until the person commits one. These
controls keep their callbacks with `getPageHref` (FR18).

### DEC-3 — `onChange` keeps its released type

**Reference:** `component:Pagination/DEC-3`
**Decider:** `nynexman4464`, `2026-11-13`

`onChange(page)` is required and receives the page alone, with or without
`getPageHref`. The dots, the Page input, and the Page-size selector have no
link, so they change the page through it, and a page link calls it as a button
control does (FR17).

Rejected: an optional `onChange` where every control is a link, because its
type then depends on the variant and on `pageSizeOptions`.

Rejected: a second argument that names the control, because a handler with its
own second parameter stops compiling.

## Open questions

- **OQ1 — Which focused tests should pin placement and reflected properties for
  the four local Pagination targets?** (`checkable`)
- **OQ2 — Should Ellipsis gain a stable public theming target?** (`human-api`)
  Its current lack of reachability does not decide the answer.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or system rules. It links to their owners.
