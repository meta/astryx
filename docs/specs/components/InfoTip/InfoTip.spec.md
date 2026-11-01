---
schema_version: 3
template_version: 7
kind: component
id: component:InfoTip
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/lab/src/InfoTip/InfoTip.test.tsx,
    packages/core/src/Tooltip/Tooltip.test.tsx,
    scripts/check-knowledge.mjs,
    apps/storybook/rtl-audit/targets.json,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:icon-resolution-and-component-slots,
  ]
contributing: []
system_specs: [spec:AST-017, spec:AST-094]
---

# InfoTip component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `InfoTip` from `@astryxdesign/core` with `content`, `label` (a localized "More information"), `size` (`sm`), a `ref` forwarded to the button, and BaseProps' `xstyle`, `className`, and `style`. The `@astryxdesign/lab` export is a deprecated re-export for one release. |
| Behavior                | A named info-icon button wrapped in `component:Tooltip` with `pressTrigger="toggle"`: hover and focus preview the help, and a click, tap, Enter, or Space pins it open until Escape, a second press, a press outside, or focus leaving.                                    |
| End-user impact         | People on a mouse, touch, keyboard, or screen reader can open, keep open, and close the help behind an "i", and hear it once when it pins.                                                                                                                                 |
| Builder impact          | Use InfoTip for help next to a label, value, or metric instead of composing an icon inside Tooltip. Lab callers change the import.                                                                                                                                         |
| Compatibility/readiness | New in Core; Core has no implementation yet (Current-state impact). The Lab component ships with Tooltip's `touchTrigger="tap"` and an English default name.                                                                                                               |
| Review checks           | Reject a layer, listener, timer, or dismissal rule of InfoTip's own, a trigger that is not a named button, an untranslated default name, or a prop beyond those FR3 lists.                                                                                                 |
| Governing rules         | `component:Tooltip` FR9, FR10, AR6; `architecture:public-component-api` INV21; `spec:AST-094` FR42; `spec:AST-017` (lifecycle).                                                                                                                                            |

This table is a review projection; the body below is authoritative.

## Intent

InfoTip is the info-icon preset over Tooltip's press toggle. It owns the
trigger button, its icon, its name, and its default, so every "i" in a product
reads and behaves the same; Tooltip owns when the help opens and closes.
Consumer usage lives in `InfoTip.doc.mjs`.

## Compatibility and migration

- Released default preserved: not yet released in Core; the Lab component's
  props keep their meaning
- Compatibility class: additive Core export; the Lab component moves to Core
  with the same props and opens through `pressTrigger="toggle"` instead of
  `touchTrigger="tap"`
- Controlled/uncontrolled behavior: uncontrolled only; open state is Tooltip's
- Migration decision: DEC-1; the `@astryxdesign/lab` `InfoTip` export stays one
  release as a deprecated re-export of the Core component, then is removed

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Core has no InfoTip yet.** Only the Lab component ships. It wraps a named
  button in Tooltip with `touchTrigger="tap"`, so a tap opens the help, hover
  and focus open it, and nothing pins it (`component:Tooltip` FR9 is not
  built). Its default name is the English literal "More information" (FR1).

## Ownership boundary

**Owns**

- The trigger button, its info icon, its accessible name and default, and its
  touch hit area (FR1, AR1).
- What InfoTip passes to Tooltip (FR2).

**Does not own / non-goals**

- When the help previews, pins, closes, and is announced, its surface, and its
  Escape order — owned by `component:Tooltip` FR3–FR10 and
  `family:overlay-dismissal`.
- Info artwork resolution — owned by the icon registry
  (`architecture:icon-resolution-and-component-slots`).
- Rich or interactive help — `component:HoverCard` with
  `pressTrigger="toggle"`.

## Public concepts

| Concept | Closed values or states | Meaning                                     | Availability by variant/orientation/state | Default | Owner               | Stability | Invalid-value behavior           |
| ------- | ----------------------- | ------------------------------------------- | ----------------------------------------- | ------- | ------------------- | --------- | -------------------------------- |
| Size    | `xsm`, `sm`, `md`, `lg` | The info icon's size: 12, 16, 20, or 24 px. | Every InfoTip.                            | `sm`    | `component:InfoTip` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                           | Basis                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| FR1 | InfoTip renders one `<button type="button">` named by `label`, else the translated `@astryx.infoTip.label` ("More information"), containing the registry's `info` icon at `size`. Implementation gap: the Lab component's default name is an untranslated English literal (Current-state impact).                                                                                                   | DEC-1; WCAG 2.2 SC 4.1.2; `architecture:icon-resolution-and-component-slots` |
| FR2 | InfoTip wraps its button in `component:Tooltip` with `content` and `pressTrigger="toggle"`, and adds no layer, listener, timer, announcement, or dismissal rule of its own: previewing, pinning, closing, the trigger's `aria-expanded` and `aria-controls`, and the announcement are Tooltip's FR3–FR10. Implementation gap: the Lab component passes `touchTrigger="tap"` (Current-state impact). | DEC-1; `architecture:public-component-api` INV21                             |
| FR3 | The public props are `content` (required; short, noninteractive help), `label`, `size`, a `ref` forwarded to the button, and BaseProps' `xstyle`, `className`, and `style`; InfoTip takes no open-state, placement, or trigger props.                                                                                                                                                               | DEC-1                                                                        |
| FR4 | The `@astryxdesign/lab` `InfoTip` export re-exports the Core component, marked deprecated with static metadata, for one release, and is then removed.                                                                                                                                                                                                                                               | `spec:AST-017` FR29, FR29a                                                   |

### Allowed variation

- **AV1 — Icon artwork.** Themes may replace the registry's `info` artwork.
- **AV2 — Help text.** `content` varies; it stays short and noninteractive.

### Representative states

| State   | Required invariant                                                 | Allowed variation |
| ------- | ------------------------------------------------------------------ | ----------------- |
| Closed  | A named button with the info icon; `aria-expanded="false"`.        | Size.             |
| Preview | Tooltip shows on hover or keyboard focus and describes the button. | —                 |
| Pinned  | Tooltip stays open, `aria-expanded="true"`, announced once.        | —                 |

### Transformation and precedence order

- **ORD1 — Name.** `label`, then the translated default.

### Performance and resources

- **PR1 — No resource of its own.** InfoTip adds no listener, observer, timer,
  or layer beyond the shared hit-area watch AR1 requires; Tooltip's are the
  only others it brings.

## Accessibility contract

- **AR1 — The trigger is a named button.** The button is in the tab order,
  named (FR1), and, under a coarse pointer, reaches 44 px through an invisible
  hit area where its neighbors leave room: the hit area never overlaps a
  neighbor's target and is clamped to half the gap between close neighbors
  (`spec:AST-094` FR42). Implementation gap: not yet built in Core.
- **AR2 — The help is a toggletip.** `component:Tooltip` AR6: keyboard and
  touch users pin and close the help without hover, the button reports
  `aria-expanded`, and the help is announced once when it pins.

## Design relationships

| Anatomy or state | Design requirement                        | Representation authority | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------- | ------------------------ | -------------- | ------------------ |
| Trigger button   | A small round button that holds the icon. | Current Lab source       | Supporting     | FR1, AR1           |
| Info icon        | The registry's `info` artwork at `size`.  | Icon registry            | Supporting     | FR1                |
| Help surface     | Tooltip's surface with `content`.         | `component:Tooltip`      | Prominent      | FR2                |

## Family and system relationships

- `component:Tooltip` owns the press toggle, preview, announcement, and
  surface; InfoTip is built entirely on it (DEC-1).
- `family:overlay-dismissal` owns Escape order through Tooltip.
- `architecture:icon-resolution-and-component-slots` owns the `info` artwork.
- InfoTip and Tooltip are one API, for the reason DEC-1 gives: InfoTip is built
  entirely on Tooltip's toggle and adds no layer, listener, or dismissal rule of
  its own, as `component:MoreMenu` is built on DropdownMenu.

## Verification map

| Contract     | Verification                                                                                                                           | Representative states                                             | Mutation or failure expectation                                                                                                                                                         | Audit section                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| FR1, AR1     | `InfoTip.test.tsx` (Lab today) name and button cases; evidence gap until built: the translated default and the coarse-pointer hit area | Default and custom name; each size                                | A trigger that is not a named button, an untranslated default, or a coarse-pointer hit area that stays under 44 px where its neighbors leave room or reaches a neighbor's target fails. | `audit:InfoTip/accessibility` |
| FR2, AR2     | Evidence gap until built: Core `InfoTip.test.tsx` press cases over `component:Tooltip`'s press-toggle suite                            | Hover and focus preview; click, tap, Enter, Space pin; Escape     | A press that does not pin, or a listener or layer InfoTip owns, fails.                                                                                                                  | `audit:InfoTip/behavior`      |
| FR3          | Evidence gap until built: a type test of the public props                                                                              | `content`, `label`, `size`, `ref`, `xstyle`, `className`, `style` | A prop beyond those, or a `ref` that does not reach the button, fails.                                                                                                                  | `audit:InfoTip/api`           |
| FR4          | Evidence gap until built: an export test of the Lab re-export                                                                          | Lab import                                                        | A Lab export that is not the Core component, or lacks the deprecation metadata, fails.                                                                                                  | `audit:InfoTip/api`           |
| RTL relation | RTL audit curated D2 target (`apps/storybook/rtl-audit/targets.json`) on `InfoTip / Next to a label`                                   | A label followed by its info tip; LTR and RTL                     | A label that is not at the inline start of its info tip fails D2.                                                                                                                       | `audit:InfoTip/i18n-rtl`      |

## Decision log

### DEC-1 — InfoTip is a preset over Tooltip's toggle

**Reference:** `component:InfoTip/DEC-1`
**Decider:** `cixzhang`, `2026-10-31`

Help behind an "i" is the same job as a tooltip that pins on a press, so
InfoTip supplies only the named button, its icon, and its default, and is
built entirely on `component:Tooltip` with `pressTrigger="toggle"`. A component
built entirely on another public API is one API with it
(`architecture:public-component-api` INV21, the reasoning `spec:AST-107` DEC-2
and DEC-3 apply to a component over a public factory), as `component:MoreMenu`
is over DropdownMenu, so InfoTip adds no second way to do Tooltip's job.

Rejected: a general toggletip component, which would repeat Tooltip's and
HoverCard's previews.

## Open questions

None.

## Content boundary

This file does not duplicate Tooltip's open, close, or announcement rules,
consumer prop tables, or examples. It links to their owners.
