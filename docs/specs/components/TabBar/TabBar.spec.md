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
system_specs:
  [
    spec:AST-085/FR1,
    spec:AST-085/FR2,
    spec:AST-085/FR5,
    spec:AST-107/DEC-1,
    spec:AST-107/FR7,
  ]
---

# TabBar component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `TabBar` takes `moreValue` (default `'more'`); `TabBarMoreList` takes `children`, `value` and `onChange`; `useTabBar` hands a bar the app draws the same behavior as values and props; Core's catalog has `@astryx.tabBar.more`.                             |
| Behavior                | Past five tabs the bar shows four tabs and More, which lists the rest, for every pointer, as UITabBarController does. The arrow keys skip a disabled tab. A bar drawn on `useTabBar` behaves as `TabBar` does, and an action beside the tabs is never a tab. |
| End-user impact         | Six or more sections stay reachable on a phone's bar, as on iOS; keyboard users never land on a disabled tab. A bar with an app's own look keeps the tab bar's names, keys and finger lens.                                                                  |
| Builder impact          | An app with more than five tabs renders `TabBarMoreList` while `value` is `moreValue`, and shows a chosen section inside More. An app that draws its own bar renders every element from `useTabBar`'s props and draws the lens from its state.               |
| Compatibility/readiness | Five tabs or fewer render as before; `useTabBar` is additive. Draft.                                                                                                                                                                                         |
| Review checks           | Reject a fifth slot that changes with the pointer, a More list that omits or reorders tabs, or a disabled row or tab that can be chosen. Reject a hook that returns a gesture recognizer or an animator, and an action inside the tab list.                  |
| Governing rules         | `spec:AST-085` FR1, FR2 and FR5 (a disabled control stays focusable, blocks every change, and is announced as disabled); `spec:AST-107` DEC-1 and FR7 (products get values and props, and Lab builds on the same layer).                                     |

This table is a review projection; the body below is authoritative.

## Intent

TabBar is the lab's floating bar of top-level sections, modelled on UIKit's
tab bar. This record states how it holds more sections than fit, how disabled
tabs meet the keyboard, and the More tab's label. An app that draws its own
bar gets the same behavior from `useTabBar`, which hands out values and props
and leaves every element to the app. Consumer usage lives in `TabBar.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` for a bar of five tabs or fewer. A bar of six or more tabs, outside the documented three to five, moves its fifth tab onward into More (FR1).
- Compatibility class: additive; `moreValue`, `TabBarMoreList` and `useTabBar` are new.
- Controlled/uncontrolled behavior: unchanged; the app owns `value`.
- Migration decision: none needed.

## Ownership boundary

**Owns**

- Which tabs the bar shows, and when More replaces the rest.
- When More reads as selected, and what choosing More again means.
- `TabBarMoreList`: More's list of the remaining tabs.
- `useTabBar`: the bar's behavior, as values and props, for a bar the app draws.

**Does not own / non-goals**

- More's navigation stack and the screens inside it — owned by the app.
- Rearranging tabs (iOS's Edit) — not provided.
- The look of a bar the app draws, and its lens's motion — owned by the app, which may animate it with `useAnimator` (`spec:AST-107` FR3).
- An action beside the tabs, such as a compose button — the app's own control (FR11).

## Public concepts

| Concept                | Closed values or states                  | Meaning                                                                                                                     | Availability by variant/orientation/state | Default  | Owner              | Stability    | Invalid-value behavior                                    |
| ---------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------- | ------------------ | ------------ | --------------------------------------------------------- |
| More tab               | shown, hidden                            | The fifth slot, standing for every tab past the fourth                                                                      | Shown only past five tabs                 | hidden   | `component:TabBar` | experimental | Not applicable                                            |
| `moreValue`            | any string                               | The value the app's `value` takes while More's list shows                                                                   | Past five tabs                            | `'more'` | `component:TabBar` | experimental | A tab with the same value is shadowed                     |
| `TabBarMoreList`       | one row per tab                          | More's screen: the tabs past the fourth, in order                                                                           | While `value` is `moreValue`              | none     | `component:TabBar` | experimental | No tabs past the fourth renders an empty list             |
| `useTabBar`            | one result per render                    | A bar the app draws: the tab list's props, each shown tab's props and state, the tabs past the fourth, and the lens's state | Always                                    | none     | `component:TabBar` | experimental | Takes `TabBar`'s props, with `items` in place of children |
| Lens state             | `rest`, `lifted`, `dragging`, `settling` | Where a finger has the lens, and the tab it is over                                                                         | Under the touch presentation              | `rest`   | `component:TabBar` | experimental | Not applicable                                            |
| Action beside the tabs | the app's control                        | A control next to the tabs, such as a compose button; never a tab                                                           | Any bar                                   | none     | The app            | experimental | Not applicable                                            |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                              | Basis                                                                                               | Draft review state |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------ |
| FR1  | Past five tabs the bar shows four tabs and More, which lists the rest, for every pointer, as UITabBarController does.                                                                                                                                                                                                                                                                                                                                            | UITabBarController's layout                                                                         | settled            |
| FR2  | More MUST read as selected while `value` is `moreValue` or any tab past the fourth.                                                                                                                                                                                                                                                                                                                                                                              | UITabBarController                                                                                  | settled            |
| FR3  | Choosing More while it is not selected MUST call `onChange` with `moreValue`; choosing it while it is selected MUST call `onReselect` with `moreValue`, never `onChange`.                                                                                                                                                                                                                                                                                        | UIKit pops More's stack                                                                             | settled            |
| FR4  | `TabBarMoreList` takes the bar's `TabBarItem` children and MUST list every tab past the fourth, in order, with its icon, label, badge and a disclosure chevron that points to the inline end; the row whose value is `value` reads as selected, and choosing an enabled row MUST call `onChange` with its value.                                                                                                                                                 | UIKit's More list                                                                                   | settled            |
| FR5  | A disabled tab's More row MUST be disabled, and choosing it MUST NOT call `onChange`.                                                                                                                                                                                                                                                                                                                                                                            | `spec:AST-085` FR2                                                                                  | settled            |
| FR6  | The arrow keys MUST skip a disabled tab, which stays announced as disabled.                                                                                                                                                                                                                                                                                                                                                                                      | Core's TabList; `spec:AST-085` Non-goals and FR5                                                    | settled            |
| FR7  | The More tab's label and the list's name MUST come from Core's catalog message `@astryx.tabBar.more`.                                                                                                                                                                                                                                                                                                                                                            | Core's message catalog                                                                              | settled            |
| FR8  | `useTabBar({value, onChange, onReselect?, onLensMove?, moreValue?, label?, items})` MUST give a bar the app draws the behavior FR1–FR7 give `TabBar`: the shown tabs, four and More past five; the selection; choosing and reselecting (FR3), with the selected tab's panel scrolling to its top; the tabs past the fourth, for a More list; and the tab list's and each tab's role, name, state and roving focus (FR6, AR1). `items` take `TabBarItem`'s props. | DEC-1                                                                                               | proposed           |
| FR9  | `useTabBar` MUST hand out values and props only, never a gesture recognizer, an arena or an animator. The lens is state: `lifted` while a finger holds it over a tab, `dragging` while it moves across the tabs, `settling` as it comes to rest on the chosen tab, and `rest`, each with the index of the tab it is over. `onLensMove` reports its position along the bar while it drags, as `usePanGesture` reports a drag (`spec:AST-107` FR1).                | `spec:AST-107` DEC-1                                                                                | proposed           |
| FR10 | `TabBar` MUST render entirely through `useTabBar`, so the component and a bar built on the hook choose, reselect, rove and move the lens alike.                                                                                                                                                                                                                                                                                                                  | DEC-1; `spec:AST-107` FR7                                                                           | proposed           |
| FR11 | An action beside the tabs, such as a compose button, MUST NOT be a tab: it sits outside the tab list, has no `aria-selected`, is not in the arrow keys' order, and takes none of the five slots. `useTabBar` gives it no props.                                                                                                                                                                                                                                  | The WAI-ARIA tabs pattern: a tab list holds only tabs; `TabBar.doc.mjs`: "Don't use it for actions" | proposed           |

### Allowed variation

- **AV1 — More's icon.** The icon may change with the theme; the slot and label may not.

### Representative states

| State                                   | Required invariant                                          | Allowed variation          |
| --------------------------------------- | ----------------------------------------------------------- | -------------------------- |
| Five tabs                               | No More tab (FR1)                                           | None                       |
| Six tabs, a fifth selected              | More selected; its list shows the fifth selected (FR2, FR4) | None                       |
| A disabled tab past the fourth          | Its row is disabled (FR5)                                   | Its dimmed paint           |
| A drawn bar, a finger dragging the lens | Lens state `dragging`, over the tab under the finger (FR9)  | The lens's look and motion |
| A drawn bar with a compose action       | The action is outside the tab list (FR11)                   | Its place beside the tabs  |

### Transformation and precedence order

- **ORD1 — selection.** A tab past the fourth resolves to More before the lens places itself (FR2).

### Performance and resources

- **PR1 — no extra listeners.** The More tab adds no listener beyond those of a tab.
- **PR2 — one implementation.** A page that renders `TabBar` carries the hook as part of the component (FR10). A page that uses only `useTabBar` carries no bar styles, capsule or lens drawing (`architecture:component-import-boundaries` INV10).

## Accessibility contract

- **AR1 — one name per row.** A More row with a badge MUST be named by `@astryx.tabBar.badgedItem`, as its tab is.
- **AR2 — named list.** `TabBarMoreList` MUST be named by `@astryx.tabBar.more`.
- **AR3 — a drawn bar keeps the names.** The props `useTabBar` returns MUST name the tab list and each tab as `TabBar` does, a badged tab by `@astryx.tabBar.badgedItem` (AR1).

## Design relationships

| Anatomy or state | Design requirement | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------ | ------------------------ | -------------- | ------------------ |
| More tab         | None recorded      | prescribed (UIKit)       | supporting     | FR1, FR7           |
| A drawn bar      | None recorded      | the app                  | supporting     | FR8, FR9           |

The component implements design requirements without copying their rationale.

## Family and system relationships

- `spec:AST-085` owns the disabled-control rules; TabBar applies FR1, FR2 and FR5 to its tabs and their More rows.
- `spec:AST-107` DEC-1 gives products values and props, never gesture machinery; `useTabBar` follows it (FR9). Its FR7 has Core and Lab build on the public layer, so `TabBar` renders through `useTabBar` (FR10), as `component:ContextMenu` renders through `useContextMenu`.
- `spec:AST-085` leaves the arrow keys inside a composite to its own record: "Which items arrow keys visit inside a composite widget (listbox, menu, grid, tablist, roving group). The composite's own record decides that." FR6 decides it for TabBar, as Core's TabList does.

## Verification map

| Contract      | Verification                                                                                                                                                                                                                                  | Representative states                                                                              | Mutation or failure expectation                                                                  | Audit section |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------- |
| FR1           | "shows the first four tabs and More when there are more than five"; "six tabs: the bar shows the first four and More…"                                                                                                                        | Five and six tabs                                                                                  | A bar without More shows six tabs and fails both                                                 | None          |
| FR2           | "selects More for a tab it holds, and chooses More with its value"                                                                                                                                                                            | A fifth tab selected                                                                               | Selecting the fifth tab itself fails it                                                          | None          |
| FR3           | "selects More for a tab it holds, and chooses More with its value"; "More again while it holds a tab is a reselect, back to its list"                                                                                                         | More unselected, and More holding a tab                                                            | Calling `onChange` with `moreValue` on a reselect, or not on a first choice, fails it            | None          |
| FR4           | "lists the tabs past the fourth, and a row chooses its tab"; "reads the selected tab’s More row as selected, and no other row"; "a section chosen in More opens inside it…"; "right to left, the More list’s disclosure chevrons point left…" | LTR and RTL, Help selected                                                                         | A missing row, selected row or unmirrored chevron fails it                                       | None          |
| FR5           | "keeps a disabled tab past the fourth disabled in its More row…"                                                                                                                                                                              | Help disabled                                                                                      | An enabled row fails it                                                                          | None          |
| FR6           | "is skipped by the arrow keys"; "a disabled tab is announced disabled on the tab itself, with its name, in the accessibility tree (spec:AST-085 FR5)"                                                                                         | A disabled second tab                                                                              | Focus landing on the disabled tab, or a missing disabled state, fails it                         | None          |
| FR7           | "names the More tab and its list with one catalog message, so a translation can change it"; `pnpm check:i18n-catalog`, for the key                                                                                                            | The More tab and its list, under an override                                                       | A hard-coded label ignores the override and fails it                                             | None          |
| FR8, FR9, AR3 | Unit tests of `useTabBar` driving a bar of plain elements                                                                                                                                                                                     | Five and six tabs, a reselect, a disabled tab, a finger lifting, dragging and lifting off the lens | A missing role or name, a reselect that changes the value, or lens states out of order fail them | None          |
| FR10          | TabBar's unit and interaction tests, over the component built on the hook                                                                                                                                                                     | Every state above                                                                                  | A behavior that differs between the component and the hook fails them                            | None          |
| FR11          | A unit test of a drawn bar with a compose button beside the tabs                                                                                                                                                                              | The arrow keys across the tabs, the action focused                                                 | The action inside the tab list, or in the arrow keys' order, fails it                            | None          |

## Decision log

### DEC-1 — An app draws its own bar on `useTabBar`

**Reference:** `component:TabBar/DEC-1`
**Decider:** pending

An app with its own look keeps the tab bar's behavior: the selection, the names
and keys, the More overflow, and the finger's lens. `useTabBar` hands these out
as values and props, the layer `spec:AST-107` DEC-1 gives products, and leaves
every element and the lens's drawing to the app (FR8, FR9). `TabBar` renders
entirely through the hook (FR10), so the two are one API, as
`architecture:public-component-api` INV21 counts a component built on a public
factory.

Rejected: a `renderTab` prop and an action slot on `TabBar`, which keep the bar's capsule and lens look.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
