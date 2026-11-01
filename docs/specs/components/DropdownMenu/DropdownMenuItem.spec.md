---
schema_version: 3
template_version: 7
kind: component
id: component:DropdownMenuItem
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, theming, testing]
verified_by:
  [
    packages/core/src/DropdownMenu/DropdownMenu.test.tsx,
    packages/core/src/DropdownMenu/__tests__/Menu.a11y.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/rtl-audit/verified-not-applicable.json,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:navigation-destinations]
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:component-test-sufficiency,
    architecture:interaction-modality,
  ]
contributing: []
system_specs: [spec:AST-020]
---

# DropdownMenuItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | One compound pointer-menu row for an action or destination, with label, supporting content, disabled state, destructive paint, optional close suppression, root inputs, and a forwarded ref.       |
| Behavior                | The parent menu owns roving focus and keyboard activation; the row owns click order, disabled suppression, close-on-select, destination handoff, hover focus, and its visible content composition. |
| End-user impact         | Actions and destinations preserve keyboard, pointer, and browser link behavior while unavailable rows remain inert and destructive actions remain identifiable.                                    |
| Builder impact          | Destinations use `href`; supporting content stays non-interactive; `hasCloseOnSelect=false` is reserved for in-place result feedback.                                                              |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change.                                                                                                                                          |
| Review checks           | Reject nested controls, disabled activation, lost destination safety, broken modified-click behavior, dropped root inputs, a second keyboard owner, or state/target reflection moved off the row.  |
| Governing rules         | `family:navigation-destinations/FR1–FR5`; `architecture:public-component-api/INV5–INV9`; `architecture:component-theming-surface/INV3–INV6`; `spec:AST-020/FR1,FR2,FR6,FR15`.                      |

This table is a review projection; the body below is authoritative.

## Intent

DropdownMenuItem renders one compound-mode row in the pointer presentation of
DropdownMenu. It owns the row element, content slots, action-versus-destination
branch, activation order, disabled and destructive state, root composition, and
`dropdown-menu-item` theme target. DropdownMenu owns the surrounding menu,
keyboard collection, focus movement, typeahead, presentation choice, and close
lifecycle.

## Compatibility and migration

- Released default preserved: yes.
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- One `role="menuitem"` root and its label, description, icon, end content,
  disabled state, destructive variant, ref, supported host inputs, and styling inputs.
- Action callback order and `hasCloseOnSelect` behavior.
- Link-row rendering, destination handoff, modified/middle-click preservation,
  target and relationship handling, and disabled-link inertness.
- Pointer hover focus and the row's press/hover/focus paint.
- The `dropdown-menu-item` target and its size/variant state reflection.

**Does not own / non-goals**

- Menu naming, open/close state, focus entry, roving focus, typeahead, and keyboard
  click synthesis — owned by DropdownMenu and its shared hooks.
- Touch and bottom-sheet row rendering — the parent presentation delegates those
  rows to List.
- Destination acceptance and blocking — owned by `family:navigation-destinations`.
- Interactive controls inside label, description, or end content. Controls belong
  beside the menu or as separate rows.

## Public concepts

| Concept      | Closed values or states                             | Meaning                                                                        | Availability                | Default | Owner                           | Stability | Invalid-value behavior                                       |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------- | ------- | ------------------------------- | --------- | ------------------------------------------------------------ |
| Row act      | action; destination                                 | Runs a callback or exposes a browser/router destination from the row itself.   | Every enabled row           | action  | component and navigation family | stable    | A blocked destination is inert; a disabled link has no href. |
| Availability | enabled; disabled                                   | Controls whether the row can receive focus or activate.                        | Every row                   | enabled | component and parent menu       | stable    | Disabled suppresses activation and destination.              |
| Close policy | close; remain open                                  | Whether successful activation closes the parent menu.                          | Action and destination rows | close   | component                       | stable    | Omission closes.                                             |
| Visual state | default; destructive; hover; focus; press; disabled | Paints row meaning and interaction state without changing menuitem semantics.  | Pointer row                 | default | component                       | stable    | Unknown variants are rejected by the public type.            |
| Root surface | ref; DOM/data/ARIA; class/style/xstyle/events       | Extends the row root while preserving component-owned role and keyboard state. | Every pointer row           | omitted | public component API            | stable    | Accepted inputs compose; owned role/tab stop remain fixed.   |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                    | Basis                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| FR1 | The pointer row exposes one `role="menuitem"` root. Label, description, icon, and end content are presentational content of that row rather than nested controls.                                                                                                                                                                            | `spec:AST-020` FR15; current source and docs                       |
| FR2 | Enabled activation runs the row callback before optional close. Disabled rows expose `aria-disabled=true`, remove link destinations, and run neither callback nor close.                                                                                                                                                                     | Current behavior and tests                                         |
| FR3 | A destination row renders as the link root through LinkProvider. Plain activation runs the callback then closes and navigates; a modified click does not run the callback, closes the menu, and is left to the browser; a middle click closes the menu (`hasCloseOnSelect`), then runs the caller's `onAuxClick`; blocked schemes are inert. | `family:navigation-destinations` FR1–FR5; current tests            |
| FR4 | The parent menu is the only keyboard owner. It synthesizes click activation with modifiers, moves focus, and runs typeahead; the row focuses itself on mouse hover and creates no second roving-focus model.                                                                                                                                 | `architecture:interaction-modality`; current parent tests          |
| FR5 | The visible root carries `dropdown-menu-item`; size and destructive state reflect on it (`data-size`, `data-variant`); semantic tokens own layout and paint before caller styling inputs compose.                                                                                                                                            | `architecture:component-theming-surface`; current source and tests |
| FR6 | Ref, supported host attributes and handlers, `className`, `style`, and `xstyle` reach or compose on the row root without replacing owned role, tab stop, disabled behavior, destination handling, or activation order.                                                                                                                       | `architecture:public-component-api` INV5–INV9; current tests       |
| FR7 | Disabled menu rows are inert, and the parent menu's arrow keys and typeahead skip them. Shipped behavior, not a requirement until OQ1 is ruled.                                                                                                                                                                                              | `component:DropdownMenu` FR17, OQ1                                 |
| FR8 | Keyboard focus paints the row's hover background with no outline, about 1.1:1 against the menu surface in the default themes; in forced-colors mode that background is not drawn, so focus has no visible indicator. Shipped behavior; the focus treatment is OQ2.                                                                           | Current source                                                     |

### Allowed variation

- **AV1 — Content.** Non-interactive icons, text, descriptions, shortcuts, badges,
  and status text may vary without changing the row's menuitem semantics.
- **AV2 — Theme paint.** A theme may restyle the target's admitted properties while
  preserving visible state distinctions and forced-colors focus.
- **AV3 — Parent size.** The parent menu supplies `sm`, `md`, or `lg`; the row reflects
  that state and may vary its tokenized insets.

### Representative states

| State                  | Required invariant                                                                  | Allowed variation                            |
| ---------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| Enabled action         | Callback runs, then close follows the close policy.                                 | Content, size, and visual variant.           |
| In-place result action | Callback runs and the menu remains open.                                            | Label/end content may update.                |
| Disabled action        | `aria-disabled=true`; callback, hover focus, and close are suppressed.              | Content remains visible.                     |
| Destination            | One anchor root preserves safe destination and browser activation behavior.         | Target, rel, router provider, and content.   |
| Destructive            | Error-role paint applies to label, icon, and description without changing behavior. | Other row content remains consumer-authored. |
| Keyboard focus         | Parent focus lands on the row and remains visible.                                  | Exact theme-owned paint may vary.            |
| RTL / narrow viewport  | Logical insets and start alignment follow direction without horizontal overflow.    | Menu placement remains parent-owned.         |

### Transformation and precedence order

- **ORD1 — Activation.** Disabled guard → browser-navigation classification → row
  callback where applicable → close policy → browser/router navigation.
- **ORD2 — Root composition.** Parent size → base row styles → variant/disabled state
  → caller `xstyle`; target metadata and caller class/style compose on the same root.

### Performance and resources

- **PR1 — Shared press listeners.** The row shares the press controller's
  window and document listeners; it adds no per-row listener, observer, timer,
  or request.

## Accessibility contract

- **AR1 — Menu item semantics.** The root is one named `menuitem`; supporting content
  does not introduce a nested interactive descendant.
- **AR2 — Disabled state.** Disabled rows expose state and cannot activate or navigate.
- **AR3 — Keyboard ownership.** DropdownMenu owns focus collection and activation;
  the item remains a single row in that model.
- **AR4 — Focus perception.** Focus paints a low-contrast row background in
  ordinary themes and no indicator in forced-colors mode (FR8, OQ2).

## Design relationships

| Anatomy or state | Design requirement                                                                  | Representation authority                        | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------- | -------------- | ------------------ |
| Row              | One full-width action/destination target with tokenized insets and start alignment. | Current source and parent menu composition      | prominent      | FR1–FR6            |
| Supporting text  | Description and end content remain subordinate to the row label.                    | Delegated Item layout and current consumer docs | supporting     | FR1                |
| Interaction      | Hover, focus, press, disabled, and destructive states remain distinguishable.       | Current source; forced-colors focus is OQ2      | prominent      | FR5, FR8, AR4      |

No component-local visual decision is recorded.

## Family and system relationships

- `family:navigation-destinations` owns destination acceptance and blocked-scheme
  behavior; this component supplies the destination-bearing row.
- `architecture:public-component-api` owns root input composition, refs, and released
  compatibility.
- `architecture:component-theming-surface` owns target placement and state reflection.
- `architecture:component-test-sufficiency` owns proportionate observable evidence.
- `architecture:interaction-modality` and DropdownMenu own parent keyboard behavior.
- `spec:AST-020` supplies WCAG/APG adoption and evidence-layer boundaries.

## Verification map

| Contract       | Verification                                                                                                                                                                                                                                                                                                               | Representative states                                     | Mutation or failure expectation                                                                                                                                                                | Audit section                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| FR1, AR1       | `DropdownMenu.test.tsx` compound-mode cases ("renders JSX children as menu items", "renders endContent after the item label"); `Menu.a11y.test.tsx` menu binding cases                                                                                                                                                     | Action row with content                                   | A row that is not a `menuitem` or loses its content fails. Evidence gap: no test asserts that supporting content holds no nested control.                                                      | `audit:DropdownMenuItem/semantics`     |
| FR2, AR2, ORD1 | `DropdownMenu.test.tsx` item cases ("calls onClick when item is clicked", "closes the menu after an item is activated", "keeps the menu open when the item opts out of closing", "does not call onClick when disabled"), "has aria-disabled on disabled compound items", and "a disabled href row renders no address"      | Enabled, disabled, close and stay-open                    | A callback while disabled, a missing `aria-disabled`, a close that ignores the policy, or a disabled row with an address fails. Evidence gap: no test asserts the callback-before-close order. | `audit:DropdownMenuItem/behavior`      |
| FR3            | `DropdownMenu.test.tsx` "DropdownMenuItem href" and "link rows — the browser's own clicks" cases; "a middle click on a link row runs the caller's onAuxClick and still closes the menu"                                                                                                                                    | Plain, modified, middle, right click; blocked destination | A non-anchor row, a modified click that runs the callback, a middle click that does not close, or a live blocked destination fails.                                                            | `audit:DropdownMenuItem/behavior`      |
| FR4, AR3       | `DropdownMenu.test.tsx` keyboard-access cases ("moves focus to the item the mouse hovers, keeping a single highlight", "does not move focus on hover for a disabled item", "does not move focus for a non-mouse (touch) pointer") and "keeps the row's own role, tab stop and hover focus beside a caller's onPointerMove" | Mouse hover, touch, disabled                              | A second highlight, hover focus on a disabled row or under touch, or a lost tab stop fails.                                                                                                    | `audit:DropdownMenuItem/accessibility` |
| FR5            | `DropdownMenu.test.tsx` destructive-variant cases; `themingTargets.test.ts`                                                                                                                                                                                                                                                | Default and destructive; data and compound mode           | A missing `data-variant` fails; a rendered class absent from the documented targets fails. Evidence gap: no test asserts the `dropdown-menu-item` class or `data-size`.                        | `audit:DropdownMenuItem/theming`       |
| FR6            | `DropdownMenu.test.tsx` ref and host-attribute cases ("a ref reaches the menuitem element", "puts aria-\*, data-\* and id on the row root, a link row included", "runs the DOM handlers the caller attaches, such as a drop target")                                                                                       | Ref; host attributes; caller handlers                     | A dropped ref, attribute, or handler fails. Evidence gap: no test asserts `className`, `style`, or `xstyle` on the row.                                                                        | `audit:DropdownMenuItem/api`           |
| FR7            | `DropdownMenu.test.tsx` "skips aria-disabled menuitemradio and menuitemcheckbox items during arrow navigation" (the shipped behavior OQ1 leaves open)                                                                                                                                                                      | Disabled rows                                             | A disabled row that activates fails.                                                                                                                                                           | `audit:DropdownMenuItem/accessibility` |
| FR8, AR4, PR1  | Evidence gap: no test asserts the focus paint, forced-colors focus, or the listener bound                                                                                                                                                                                                                                  | —                                                         | —                                                                                                                                                                                              | `audit:DropdownMenuItem/visual`        |
| RTL            | `apps/storybook/rtl-audit/verified-not-applicable.json` DropdownMenuItem entry                                                                                                                                                                                                                                             | LTR and RTL                                               | A changed source hash fails the receipt.                                                                                                                                                       | `audit:DropdownMenuItem/rtl`           |

## Current-state impact

- **Focus visibility (FR8).** Keyboard focus on a row shows only a background
  tint about 1.1:1 against the menu surface, and no indicator in forced-colors
  mode; the treatment is OQ2.

## Decision log

No component-local decision.

## Open questions

- **OQ1 — Which shared keyboard owner should keep disabled menu items discoverable
  while preserving their inert behavior?** (`human-api`)
- **OQ2 — Should forced-colors focus use a component-specific system outline, or a
  shared row-focus treatment that also governs ordinary themes?** (`human-design`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit scores,
screenshot matrices, implementation steps, or family/system rules. It links to
their owners.
