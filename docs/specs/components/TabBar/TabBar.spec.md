---
schema_version: 3
template_version: 7
kind: component
id: component:TabBar
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/lab/src/TabBar/TabBar.test.tsx,
    packages/lab/src/TabBar/__tests__/TabBar.interaction.browser.spec.ts,
  ]
modules: []
families: []
design_specs: []
architecture: []
contributing: []
system_specs: [spec:AST-085/FR1, spec:AST-085/FR2, spec:AST-085/FR5]
---

# TabBar component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `TabBar` takes `moreValue` (default `'more'`); `TabBarMoreList` takes `children`, `value` and `onChange`; Core's catalog has `@astryx.tabBar.more`.       |
| Behavior                | Past five tabs the bar shows four tabs and More, which lists the rest, for every pointer, as UITabBarController does. The arrow keys skip a disabled tab. |
| End-user impact         | Six or more sections stay reachable on a phone's bar, as on iOS; keyboard users never land on a disabled tab.                                             |
| Builder impact          | An app with more than five tabs renders `TabBarMoreList` while `value` is `moreValue`, and shows a chosen section inside More.                            |
| Compatibility/readiness | Five tabs or fewer render as before. Draft.                                                                                                               |
| Review checks           | Reject a fifth slot that changes with the pointer, a More list that omits or reorders tabs, or a disabled row or tab that can be chosen.                  |
| Governing rules         | `spec:AST-085` FR1, FR2 and FR5 (a disabled control stays focusable, blocks every change, and is announced as disabled).                                  |

This table is a review projection; the body below is authoritative.

## Intent

TabBar is the lab's floating bar of top-level sections, modelled on UIKit's
tab bar. This record states how it holds more sections than fit, how disabled
tabs meet the keyboard, and the More tab's label. Consumer usage lives in
`TabBar.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` for a bar of five tabs or fewer. A bar of six or more tabs, outside the documented three to five, moves its fifth tab onward into More (FR1).
- Compatibility class: additive; `moreValue` and `TabBarMoreList` are new.
- Controlled/uncontrolled behavior: unchanged; the app owns `value`.
- Migration decision: none needed.

## Ownership boundary

**Owns**

- Which tabs the bar shows, and when More replaces the rest.
- When More reads as selected, and what choosing More again means.
- `TabBarMoreList`: More's list of the remaining tabs.

**Does not own / non-goals**

- More's navigation stack and the screens inside it — owned by the app.
- Rearranging tabs (iOS's Edit) — not provided.

## Public concepts

| Concept          | Closed values or states | Meaning                                                   | Availability by variant/orientation/state | Default  | Owner              | Stability    | Invalid-value behavior                        |
| ---------------- | ----------------------- | --------------------------------------------------------- | ----------------------------------------- | -------- | ------------------ | ------------ | --------------------------------------------- |
| More tab         | shown, hidden           | The fifth slot, standing for every tab past the fourth    | Shown only past five tabs                 | hidden   | `component:TabBar` | experimental | Not applicable                                |
| `moreValue`      | any string              | The value the app's `value` takes while More's list shows | Past five tabs                            | `'more'` | `component:TabBar` | experimental | A tab with the same value is shadowed         |
| `TabBarMoreList` | one row per tab         | More's screen: the tabs past the fourth, in order         | While `value` is `moreValue`              | none     | `component:TabBar` | experimental | No tabs past the fourth renders an empty list |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                              | Basis                                            | Draft review state |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------ |
| FR1 | Past five tabs the bar shows four tabs and More, which lists the rest, for every pointer, as UITabBarController does.                                                                                                                                                                                            | UITabBarController's layout                      | settled            |
| FR2 | More MUST read as selected while `value` is `moreValue` or any tab past the fourth.                                                                                                                                                                                                                              | UITabBarController                               | settled            |
| FR3 | Choosing More while it is not selected MUST call `onChange` with `moreValue`; choosing it while it is selected MUST call `onReselect` with `moreValue`, never `onChange`.                                                                                                                                        | UIKit pops More's stack                          | settled            |
| FR4 | `TabBarMoreList` takes the bar's `TabBarItem` children and MUST list every tab past the fourth, in order, with its icon, label, badge and a disclosure chevron that points to the inline end; the row whose value is `value` reads as selected, and choosing an enabled row MUST call `onChange` with its value. | UIKit's More list                                | settled            |
| FR5 | A disabled tab's More row MUST be disabled, and choosing it MUST NOT call `onChange`.                                                                                                                                                                                                                            | `spec:AST-085` FR2                               | settled            |
| FR6 | The arrow keys MUST skip a disabled tab, which stays announced as disabled.                                                                                                                                                                                                                                      | Core's TabList; `spec:AST-085` Non-goals and FR5 | settled            |
| FR7 | The More tab's label and the list's name MUST come from Core's catalog message `@astryx.tabBar.more`.                                                                                                                                                                                                            | Core's message catalog                           | settled            |

### Allowed variation

- **AV1 — More's icon.** The icon may change with the theme; the slot and label may not.

### Representative states

| State                          | Required invariant                                          | Allowed variation |
| ------------------------------ | ----------------------------------------------------------- | ----------------- |
| Five tabs                      | No More tab (FR1)                                           | None              |
| Six tabs, a fifth selected     | More selected; its list shows the fifth selected (FR2, FR4) | None              |
| A disabled tab past the fourth | Its row is disabled (FR5)                                   | Its dimmed paint  |

### Transformation and precedence order

- **ORD1 — selection.** A tab past the fourth resolves to More before the lens places itself (FR2).

### Performance and resources

- **PR1 — no extra listeners.** The More tab adds no listener beyond those of a tab.

## Accessibility contract

- **AR1 — one name per row.** A More row with a badge MUST be named by `@astryx.tabBar.badgedItem`, as its tab is.
- **AR2 — named list.** `TabBarMoreList` MUST be named by `@astryx.tabBar.more`.

## Design relationships

| Anatomy or state | Design requirement | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------ | ------------------------ | -------------- | ------------------ |
| More tab         | None recorded      | prescribed (UIKit)       | supporting     | FR1, FR7           |

The component implements design requirements without copying their rationale.

## Family and system relationships

- `spec:AST-085` owns the disabled-control rules; TabBar applies FR1, FR2 and FR5 to its tabs and their More rows.
- `spec:AST-085` leaves the arrow keys inside a composite to its own record: "Which items arrow keys visit inside a composite widget (listbox, menu, grid, tablist, roving group). The composite's own record decides that." FR6 decides it for TabBar, as Core's TabList does.

## Verification map

| Contract | Verification                                                                                                                                                                                                                                  | Representative states                        | Mutation or failure expectation                                                       | Audit section |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- | ------------- |
| FR1      | "shows the first four tabs and More when there are more than five"; "six tabs: the bar shows the first four and More…"                                                                                                                        | Five and six tabs                            | A bar without More shows six tabs and fails both                                      | None          |
| FR2      | "selects More for a tab it holds, and chooses More with its value"                                                                                                                                                                            | A fifth tab selected                         | Selecting the fifth tab itself fails it                                               | None          |
| FR3      | "selects More for a tab it holds, and chooses More with its value"; "More again while it holds a tab is a reselect, back to its list"                                                                                                         | More unselected, and More holding a tab      | Calling `onChange` with `moreValue` on a reselect, or not on a first choice, fails it | None          |
| FR4      | "lists the tabs past the fourth, and a row chooses its tab"; "reads the selected tab’s More row as selected, and no other row"; "a section chosen in More opens inside it…"; "right to left, the More list’s disclosure chevrons point left…" | LTR and RTL, Help selected                   | A missing row, selected row or unmirrored chevron fails it                            | None          |
| FR5      | "keeps a disabled tab past the fourth disabled in its More row…"                                                                                                                                                                              | Help disabled                                | An enabled row fails it                                                               | None          |
| FR6      | "is skipped by the arrow keys"; "a disabled tab is announced disabled on the tab itself, with its name, in the accessibility tree (spec:AST-085 FR5)"                                                                                         | A disabled second tab                        | Focus landing on the disabled tab, or a missing disabled state, fails it              | None          |
| FR7      | "names the More tab and its list with one catalog message, so a translation can change it"; `pnpm check:i18n-catalog`, for the key                                                                                                            | The More tab and its list, under an override | A hard-coded label ignores the override and fails it                                  | None          |

## Decision log

None recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
