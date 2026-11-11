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
    packages/core/src/InfoTip/InfoTip.test.tsx,
    packages/core/src/InfoTip/InfoTip.pin.test.tsx,
    packages/core/src/InfoTip/__tests__/InfoTipTouch.a11y.chromium.spec.ts,
    packages/core/src/InfoTip/__tests__/InfoTipAudit.a11y.chromium.spec.ts,
    packages/core/src/Layer/__tests__/TouchTrigger.a11y.chromium.spec.ts,
    packages/lab/src/InfoTip/InfoTip.test.tsx,
    packages/core/src/Tooltip/Tooltip.test.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:icon-resolution-and-component-slots,
    architecture:component-theming-surface,
  ]
contributing: []
system_specs: [spec:AST-017, spec:AST-094]
---

# InfoTip component contract

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/lab/src/InfoTip/index.ts"]
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `InfoTip` from `@astryxdesign/core` with `content`, `label` (a localized "More information"), `size` (`sm`), a `ref` forwarded to the button, and BaseProps' `xstyle`, `className`, and `style`. The `@astryxdesign/lab` export is a deprecated re-export for one release.                                                                           |
| Behavior                | A named native info-icon button that pins its help through `useTooltip`'s `show()` and `hide()`: hover and focus preview the help, a click, tap, Enter, or Space pins it open until Escape, a second press, a press outside, or focus leaving, and a mouse or pen press on a tip shown by hover holds it in place, without hiding and showing again. |
| End-user impact         | People on a mouse, touch, keyboard, or screen reader can open, keep open, and close the help behind an "i", and hear it once when it pins.                                                                                                                                                                                                           |
| Builder impact          | Use InfoTip for help next to a label, value, or metric instead of composing an icon inside Tooltip. Lab callers change the import.                                                                                                                                                                                                                   |
| Compatibility/readiness | Released in Core 0.7.7; the `@astryxdesign/lab` export is a deprecated re-export of it for one release (FR4).                                                                                                                                                                                                                                        |
| Review checks           | Reject a layer, document listener, timer, or dismissal rule of InfoTip's own, a wrapper element around the button, a trigger that is not a named native button, a pinning press that reaches a row, card, or label around it, a preview that blinks on a mouse or pen press, an untranslated default name, or a prop beyond those FR3 lists.         |
| Governing rules         | `component:Tooltip` FR9, FR10, FR12, AR6; `architecture:public-component-api` INV21; `spec:AST-094` FR42; `spec:AST-017` (lifecycle).                                                                                                                                                                                                                |

This table is a review projection; the body below is authoritative.

## Intent

InfoTip is the info-icon preset over `useTooltip`'s `show()` and `hide()`. It
owns the trigger button, its icon, its name, its default, and the press that
pins and closes the help, so every "i" in a product reads and behaves the
same; Tooltip owns the preview, the pinned hold, and the announcement.
Consumer usage lives in `InfoTip.doc.mjs`.

## Compatibility and migration

- Released default preserved: yes. Core released InfoTip in 0.7.7, and 0.7.8
  removed its wrapper element (DEC-1, amended); the Lab component's props keep
  their meaning
- Compatibility class: additive Core export; the Lab component moves to Core
  with the same props and pins through `useTooltip`'s `show()` and `hide()`
  instead of opening through `touchTrigger="tap"`
- Controlled/uncontrolled behavior: uncontrolled only; open state is Tooltip's
- Migration decision: DEC-1; the `@astryxdesign/lab` `InfoTip` export stays one
  release as a deprecated re-export of the Core component, then is removed

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- At the standard spacing, the sm box is 20×20 px under a fine pointer (some
  themes render it 22×22 px); where the caller keeps other targets 24 px away,
  it meets WCAG 2.5.8 through the spacing exception, and `spec:AST-094` FR42
  keeps desktop boxes unchanged.

## Ownership boundary

**Owns**

- The trigger button, its info icon, its accessible name and default, and its
  touch hit area (FR1, AR1).
- The press that pins and closes the help through `useTooltip`'s `show()` and
  `hide()`, and the button's `aria-describedby`, `aria-expanded`, and
  `aria-controls` (FR2).

**Does not own / non-goals**

- When the help previews, how a pinned help closes, its announcement, its
  surface, and its Escape order — owned by `component:Tooltip` FR3–FR10 and
  FR12, and `family:overlay-dismissal`.
- Info artwork resolution — owned by the icon registry
  (`architecture:icon-resolution-and-component-slots`).
- Rich or interactive help — `component:HoverCard`.

## Public concepts

| Concept | Closed values or states | Meaning                                     | Availability by variant/orientation/state | Default | Owner               | Stability | Invalid-value behavior           |
| ------- | ----------------------- | ------------------------------------------- | ----------------------------------------- | ------- | ------------------- | --------- | -------------------------------- |
| Size    | `xsm`, `sm`, `md`, `lg` | The info icon's size: 12, 16, 20, or 24 px. | Every InfoTip.                            | `sm`    | `component:InfoTip` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Basis                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| FR1 | InfoTip renders one `<button type="button">` named by `label`, else the translated `@astryx.infoTip.label` ("More information"), containing the registry's `info` icon at `size`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | DEC-1; WCAG 2.2 SC 4.1.2; `architecture:icon-resolution-and-component-slots`          |
| FR2 | InfoTip renders its button and the layer from one `useTooltip` call with `content`, with no wrapper element; Tooltip's ref and the hit-area ref merge on the button. The button carries `aria-describedby` naming the help, `aria-expanded` (`true` only while pinned), and `aria-controls` naming the surface while the help shows. A click, tap, Enter, or Space pins the help through `show()`, and the same press on pinned help closes it through `hide()`; the press stops in the React tree, so a row, card, or label around the button does not act. A mouse or pen press on a tip shown by hover holds it in place through `show()` at pointer-down, so Tooltip's press-to-close (`component:Tooltip` FR6) leaves it open: it does not hide and show again, and the click then pins it. Touch and keyboard pin only through the click. InfoTip adds no layer, document listener, timer, announcement, or dismissal rule of its own: previewing, how pinned help closes, and the announcement are Tooltip's FR3–FR10 and FR12. | DEC-1; `component:Tooltip` FR9, FR10, FR12; `architecture:public-component-api` INV21 |
| FR3 | The public props are `content` (required; short, noninteractive help), `label`, `size`, a `ref` forwarded to the button, and BaseProps' `xstyle`, `className`, and `style`; InfoTip takes no open-state, placement, or trigger props.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | DEC-1                                                                                 |
| FR4 | The `@astryxdesign/lab` `InfoTip` export re-exports the Core component, marked deprecated with static metadata, for one release, and is then removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `spec:AST-017` FR29, FR29a                                                            |

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

- **PR1 — No resource of its own.** InfoTip adds no document listener,
  observer, timer, or layer beyond its button's click and pointer-down
  handlers; Tooltip's are the only others it brings. Its touch band (AR1) is
  CSS, and reads layout only at a finger's tap on it.

## Accessibility contract

- **AR1 — The trigger is a named button.** The button is in the tab order,
  named (FR1), and, under a coarse pointer, grows toward 44 px up and down
  through an invisible band. It sits in running text, so the band grows no
  room sideways. A tap on another target's visible box, such as a link just
  before it, stays that target's (`spec:AST-094` FR42).
- **AR2 — The help is a toggletip.** `component:Tooltip` AR6: keyboard and
  touch users pin and close the help without hover, the button reports
  `aria-expanded`, and the help is announced once when it pins.

## Design relationships

| Anatomy or state | Design requirement                        | Representation authority | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------- | ------------------------ | -------------- | ------------------ |
| Trigger button   | A small round button that holds the icon. | Current source           | Supporting     | FR1, AR1           |
| Info icon        | The registry's `info` artwork at `size`.  | Icon registry            | Supporting     | FR1                |
| Help surface     | Tooltip's surface with `content`.         | `component:Tooltip`      | Prominent      | FR2                |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Trigger button": {
    "none": {
      "reason": "unsettled: InfoTip's own button paints but has no public theming target yet; adding an `info-tip` target is a future owner decision"
    }
  },
  "Info icon": {"delegatesTo": {"owner": "component:Icon", "target": "icon"}},
  "Help surface": {
    "delegatesTo": {"owner": "component:Tooltip", "target": "tooltip"}
  }
}
```

The `none` disposition records current reachability while target exposure for
the trigger button remains unsettled
(`architecture:component-theming-surface` INV3). The info icon's artwork comes
from the icon registry, and the help surface is Tooltip's
(`architecture:component-theming-surface` INV5).

## Family and system relationships

- `component:Tooltip` owns the preview, the `show()` hold, the announcement,
  and the surface; InfoTip is built entirely on `useTooltip` (DEC-1).
- `family:overlay-dismissal` owns Escape order through Tooltip.
- `architecture:icon-resolution-and-component-slots` owns the `info` artwork.
- InfoTip and Tooltip are one API, for the reason DEC-1 gives: InfoTip is built
  entirely on `useTooltip`'s public `show()` and `hide()` and adds no layer,
  timer, or dismissal rule of its own, as `component:MoreMenu` is built on DropdownMenu.

## Verification map

| Contract            | Verification                                                                                                                                                                                                                                                                                                                                            | Representative states                                                                                                                                                                                                       | Mutation or failure expectation                                                                                                                                                                                                                                                      | Audit section                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| FR1, AR1            | `InfoTip.test.tsx` button, name, catalog-default, icon-size and hit-area cases; `InfoTipTouch.a11y.chromium.spec.ts` coarse-pointer reach, neighbour and fine-pointer cases; `InfoTipAudit.a11y.chromium.spec.ts` button, name, icon-size, round-box, focus-outline and spacing-exception checks under a fine pointer, in light and dark and two themes | Default and custom name; each size; a button next to a label                                                                                                                                                                | A trigger that is not a named button, an untranslated default, an icon off its size, a coarse-pointer hit area that stays under 44 px where its neighbors leave room or reaches a neighbor's target, or a fine-pointer box under 24 px with a neighboring target within 24 px fails. | `audit:InfoTip/accessibility` |
| FR2, AR2            | `InfoTip.pin.test.tsx`; `InfoTip.test.tsx` press cases; `InfoTipAudit.a11y.chromium.spec.ts` hover, keyboard-focus, click-pin, key-pin and Escape cases; `TouchTrigger.a11y.chromium.spec.ts` InfoTip press-to-pin and pinned-under-a-mouse suites                                                                                                      | Hover and focus preview; click, tap, Enter, Space pin; second press, press outside, focus leaving, and Escape close; a mouse or pen press on a hover preview; a button inside a ClickableCard, an Item row, and a `<label>` | A press that does not pin or close, a preview that closes and reopens on a mouse or pen press, a missing or stale `aria-expanded` or `aria-controls`, a press that also activates the card, row, or labelled control, or a wrapper, layer, or document listener InfoTip owns, fails. | `audit:InfoTip/behavior`      |
| FR3                 | `InfoTip.test.tsx` props cases: the type checker rejects other props, and `ref`, `xstyle`, `className`, and `style` reach the button                                                                                                                                                                                                                    | `content`, `label`, `size`, `ref`, `xstyle`, `className`, `style`                                                                                                                                                           | A prop beyond those, or a `ref` that does not reach the button, fails.                                                                                                                                                                                                               | `audit:InfoTip/api`           |
| FR4                 | Lab `InfoTip.test.tsx` identity and deprecation cases                                                                                                                                                                                                                                                                                                   | Lab import                                                                                                                                                                                                                  | A Lab export that is not the Core component, or lacks the deprecation metadata, fails.                                                                                                                                                                                               | `audit:InfoTip/api`           |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                           | The three anatomy parts and their dispositions                                                                                                                                                                              | A missing, extra, or stale mapping, or a delegation to a target its owner does not declare, fails repository validation.                                                                                                                                                             | `audit:InfoTip/theming`       |

## Decision log

### DEC-1 — InfoTip is a preset over `useTooltip`'s show and hide

**Reference:** `component:InfoTip/DEC-1`
**Decider:** `cixzhang`, `2026-10-31`; amended `2026-11-03`

Help behind an "i" is the same job as a tooltip that pins on a press, so
InfoTip supplies only the named button, its icon, its default, and the press
that pins, and is built entirely on `useTooltip`'s public `show()` and `hide()`
(`component:Tooltip` FR12). Tooltip has no toggle option of its own: InfoTip
pins the way any app's toggle-style button does. A component built entirely
on another public API is one API with it
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
