---
schema_version: 3
template_version: 7
kind: component
id: component:ProgressBar
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/ProgressBar/ProgressBar.test.tsx,
    packages/core/src/ProgressBar/__tests__/ProgressBar.a11y.test.tsx,
    packages/core/src/ProgressBar/__tests__/ProgressBar.a11y.chromium.spec.ts,
    packages/core/src/ProgressBar/__tests__/ProgressBarMotion.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    .github/visual-baseline/manifest.json,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:theme-authoring-contract,
    architecture:theme-tokens,
    architecture:internationalization,
  ]
contributing: []
system_specs:
  [
    spec:AST-002/DEC-1,
    spec:AST-002/DEC-2,
    spec:AST-009,
    spec:AST-094,
    spec:AST-108,
  ]
---

# ProgressBar component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `label`, `value`, `max`, `isLabelHidden`, `hasValueLabel`, `formatValueLabel`, `variant`, `isIndeterminate`, `marks`, `isDisabled`, root `BaseProps`, and a root `ref`.                                                                                                               |
| Behavior                | A labelled `progressbar` whose fill shows the clamped value against a muted track, moving at UIKit's speed under a finger, or slides while indeterminate and pulses in place under reduced motion, with optional value text and labelled target marks.                                |
| End-user impact         | People see how far an operation has gone, and assistive technology reads the name and value; marks reveal their labels on hover or focus.                                                                                                                                             |
| Builder impact          | A builder's `data-variant` replaces the reflected variant today, so theme rules for the bar's real variant stop matching (FR8 gap); otherwise none.                                                                                                                                   |
| Compatibility/readiness | No API or default changes; the touch fill timing (FR4) and the reduced-motion pulse (FR6) are unbuilt. Implementation gaps are listed under Current-state impact.                                                                                                                     |
| Review checks           | Reject a determinate bar whose correctness depends on nearby text, a value outside `[0, max]`, a leaked `NaN`, value semantics while indeterminate, or a target off its part.                                                                                                         |
| Governing rules         | `component:ProgressBar/DEC-1`, `DEC-2`; `spec:AST-002`; `spec:AST-094` FR4, FR13; `design:reduced-motion` DR1; `architecture:component-theming-surface`; `architecture:theme-tokens` INV11; `architecture:internationalization` INV1a; `architecture:public-component-api` INV5–INV8. |

This table is a review projection; the body below is authoritative.

## Intent

ProgressBar communicates the progress of an operation. A determinate bar is a
sufficient standalone visual: people can distinguish completed from remaining
progress without depending on visible text rendered elsewhere. External text
may supplement the bar, but it is not a prerequisite for the bar to be correct.

Consumer syntax and examples belong in `ProgressBar.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — determinate, `value` 0, `max` 100,
  `accent`, visible label, no value text, no marks.
- Compatibility class: records shipped behavior plus two motion changes with
  no API, default, or value change: a determinate fill's timing under a coarse
  primary pointer (FR4) and the indeterminate fill under reduced motion (FR6);
  the four canonical `progress-bar*` targets are the only target classes.
- Controlled/uncontrolled behavior: not applicable; `value` is caller-owned.
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Value text assembled outside the catalog (FR3).** The default value text
  and `aria-valuetext` are `${percent}%` built in code, so locales that write
  percentages differently read and see the English form, where
  `architecture:internationalization` INV1a has Astryx-owned text come from
  one catalog message.
- **Marks are focusable without a role or name (FR7).** Each mark is a
  focusable `span` with no role and no accessible name; its label reaches
  assistive technology only as a description, and only once the tooltip code
  has loaded, so screen reader users land on an unnamed stop (WCAG 2.2 SC
  4.1.2).
- **Caller `data-variant` replaces the reflected variant (FR8).** Caller props
  spread after the root's theme attributes, so a caller `data-variant`
  replaces the reflected value and theme rules for the real variant stop
  matching, where `architecture:public-component-api` INV5 keeps
  component-owned behavior from being overwritten.
- **Theme-added variant has no baseline fill (FR4).** The variant map is
  exported for themes to extend, but an added variant matches no built-in fill
  or on-fill mark color, so the fill paints nothing until a theme styles it, where
  `architecture:component-theming-surface` INV14 asks for a safe baseline.
- **Indeterminate slide follows any right-to-left ancestor (FR6).** The
  indeterminate slide and the centering of marks mirror under any
  right-to-left ancestor rather than the bar's own direction, so in a
  left-to-right region of a right-to-left page they run against the label,
  where `architecture:internationalization` INV11 resolves mirroring from the
  rendered region.

- **Touch fill timing is unbuilt (FR4).** Under a coarse primary pointer the
  determinate fill still eases over `--duration-medium` like a mouse's, a value
  just above zero can draw shorter than 16px, and the `progress.fillTrackMs`
  and `progress.curves.fill` roles are not in the generated motion role table.
- **The reduced-motion indeterminate fill still travels (FR6).** Under reduced
  motion the 40% segment keeps sliding, slowed to 3s a pass, on every pointer,
  where FR6 holds a full-width fill that only pulses its opacity, and the
  `progress.reducedMotionPulseMs` role is not in the generated motion role
  table.
- **Warning and neutral fills under 3:1 in the light default theme (FR6,
  OQ1).** Against the track, the warning fill reaches 1.65–1.82:1 and the
  neutral fill 1.84–2.03:1 even at full opacity (on the body and surface
  backgrounds), so FR6's 3:1 dim-phase floor cannot hold for those two tones
  in light; every other tone, and every tone in dark, meets it.

## Ownership boundary

**Owns**

- A sufficient standalone visual distinction between completed and remaining
  progress for every determinate presentation the component provides.
- The container, label row, track (the `progressbar` element), fill, and marks,
  and their `progress-bar`, `progress-bar-track`, `progress-bar-fill`, and
  `progress-bar-mark` targets.
- Value clamping, value text, indeterminate motion, and mark placement.

**Does not own / non-goals**

- External visible labels, values, or descriptions — owned by the product
  callsite and supplementary to the bar.
- A separate public target for the built-in label or value text; none exists.
- The exact standalone contrast treatment — a human design decision (OQ1).
- Theme token definitions — owned by `architecture:theme-tokens`.
- The mark tooltip's behavior — owned by `component:Tooltip`.

## Public concepts

| Concept          | Closed values or states                                                                                 | Meaning                                                             | Availability by variant/orientation/state | Default                 | Owner                   | Stability                         | Invalid-value behavior                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- | ----------------------- | ----------------------- | --------------------------------- | ---------------------------------------------------------------- |
| Progress mode    | determinate; indeterminate                                                                              | Whether completed progress is known.                                | All variants                              | determinate             | `component:ProgressBar` | Stable                            | —                                                                |
| Value and range  | finite `value` within `0`–`max`                                                                         | Completed amount.                                                   | Determinate                               | 0 of 100                | caller                  | Stable                            | Clamped to `[0, max]`; a non-finite value or `max` counts as 0.  |
| Label            | string, visible or visually hidden                                                                      | The bar's accessible name.                                          | Always                                    | visible                 | caller                  | Stable                            | —                                                                |
| Value text       | hidden; shown; custom formatter                                                                         | Optional visible value beside the label, also the `aria-valuetext`. | Determinate                               | hidden; rounded percent | `component:ProgressBar` | Stable                            | Ignored when indeterminate.                                      |
| Variant          | `accent`, `success`, `warning`, `error`, `neutral`; theme-added values through the exported variant map | Fill color.                                                         | Always                                    | `accent`                | `component:ProgressBar` | Stable                            | An added value paints no fill until a theme styles it (FR4 gap). |
| Disabled         | `true`, `false`                                                                                         | Muted fill, label, and marks.                                       | Always                                    | `false`                 | `component:ProgressBar` | Stable                            | —                                                                |
| Marks            | `{value, label}` list                                                                                   | Labelled ticks on the track.                                        | Determinate                               | none                    | caller                  | Stable                            | Non-finite values are dropped; others clamp to the track.        |
| Visual treatment | one sufficient standalone treatment; exact form open                                                    | How the graphic distinguishes completed from remaining progress.    | Determinate                               | —                       | `component:ProgressBar` | Decided by DEC-1; form open (OQ1) | No incomplete public mode.                                       |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| FR1 | Every determinate presentation ProgressBar provides is a sufficient standalone visual for distinguishing completed from remaining progress; external visible text may supplement it but is never required, and supplementary text or graphics never substitute for that distinction. ProgressBar does not make visual correctness depend on caller-declared external content it cannot verify or associate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `component:ProgressBar/DEC-1`; `spec:AST-002`                                                   |
| FR2 | New public API that adjusts the visual distinction is considered only after the component has a correct base behavior and a stable caller-owned distinction still remains.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `component:ProgressBar/DEC-1`; `spec:AST-002`                                                   |
| FR3 | The root holds a label row and a track. The label names the track (`role="progressbar"`) through `aria-labelledby`; `isLabelHidden` hides it visually only. When determinate, the track exposes `aria-valuenow` (the clamped value), `aria-valuemin` 0, `aria-valuemax` (`max`), and `aria-valuetext` from `formatValueLabel`, which defaults to the rounded percentage; `hasValueLabel` shows the same text beside the label. A zero or non-finite `max` gives 0% and never renders `NaN`. Astryx-owned value text comes from one catalog message (`architecture:internationalization` INV1a). Implementation gap: the default text is assembled in code (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source and tests                                                                        |
| FR4 | The track is 8px high, fully rounded, in `--color-background-muted`, and clips the fill. The determinate fill spans the track and slides along it so its leading edge sits at the clamped percentage, mirrored by the bar's own writing direction, moving over `--duration-medium` when the value changes. Under a coarse primary pointer (`spec:AST-094` FR13) it instead moves linearly from where it is drawn when the value changes, for the `progress.fillTrackMs` role (1000ms, UIKit's progress view for a whole-track change) times the share of the track the value moved, so 10% to 90% takes 800ms; above zero it draws at least 16px long, a mark that length covers counts as on the fill (FR7), and at zero it paints nothing. That duration and its linear curve, `progress.curves.fill`, are roles in the generated motion role table, and a theme's tempo scales the duration (`spec:AST-094` FR4, DEC-1, DEC-5; `spec:AST-108` FR3); any other pointer keeps the theme's eased duration. Under reduced motion a new value lands at once on every pointer (`design:reduced-motion` DR1). Implementation gap: the touch timing, the 16px minimum, and both roles are unbuilt (Current-state impact). The fill paints `--color-accent`, `--color-success`, `--color-warning`, or `--color-error`, or `--color-text-disabled` for `neutral` and disabled bars; a theme-added variant has a safe theme-independent fill (`architecture:component-theming-surface` INV14). Implementation gap: a theme-added variant paints no fill and no on-fill mark color until a theme styles it (Current-state impact). In forced colors the fill is sized to the value instead of sliding and keeps a 1px `CanvasText` outline so its shape stays visible (`architecture:theme-tokens` INV11). | Current source and tests; UIKit measurement (iOS 26.2 simulator); `component:ProgressBar/DEC-2` |
| FR5 | `isDisabled` mutes the fill, label, value text, and marks and adds no ARIA state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source and tests                                                                        |
| FR6 | `isIndeterminate` removes every value attribute and the value text. Without reduced motion, on every pointer, a 40% fill slides across the clipped track, eased, 1.5s a pass, mirrored by the bar's own rendered direction (`architecture:internationalization` INV11). Under reduced motion, on every pointer, the fill spans the whole track as one solid bar, with no segment and no travel, and only its opacity pulses: from 1 down to 0.84 and back, each way taking the `progress.reducedMotionPulseMs` role (2000ms) on the `timing.curves.move` curve; the track is unchanged. The pulse is a busy loop, so tempo does not scale it (`spec:AST-094` FR4, `spec:AST-108` FR4). It applies `design:reduced-motion` DR1's no-travel rule, replacing the travel with an opacity change, to a loop that record leaves to its component. At the 0.84 floor the fill keeps at least 3:1 against the track in both themes for every tone that reaches 3:1 at full opacity (AR4). Implementation gap: under reduced motion the segment still slides, slowed to 3s a pass, and the pulse role is unbuilt (Current-state impact). Implementation gap: the slide, and the centering of marks, mirror under any right-to-left ancestor rather than the bar's own direction, so in a left-to-right region of a right-to-left page they run against the label (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source and tests; `component:ProgressBar/DEC-2`                                         |
| FR7 | Each finite mark renders, outside the `progressbar` element, a tick at its clamped position whose tooltip shows its label on hover and focus; marks inside the filled part take the fill's contrasting color, and marks do not render while indeterminate. A focusable mark exposes its label as its accessible name (WCAG 2.2 SC 4.1.2). Implementation gap: marks are focusable `span`s with no role or name, labelled only as a description once the tooltip loads (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests                                                                        |
| FR8 | The root carries `progress-bar` reflecting `variant`, the track `progress-bar-track`, the fill `progress-bar-fill` reflecting the resolved fill variant, and each mark `progress-bar-mark` reflecting the resolved fill variant and placement; the label and value text carry no target. Reflected state stays component-owned (`architecture:public-component-api` INV5). Implementation gap: a caller `data-variant` replaces the root's reflected variant (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current source and tests                                                                        |
| FR9 | `ref` and `data-testid` reach the root; supported DOM, data, ARIA, and event props reach the root, while the reflected theme attributes stay component-owned (FR8); `xstyle`, `className`, and `style` compose after component styles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Current source and tests; `architecture:public-component-api` INV5–INV8                         |

### Allowed variation

- **AV1 — Exact visual treatment.** Shape, token choice, and other rendering
  details may vary if every resulting presentation satisfies FR1.
- **AV2 — Themes.** Themes may express their visual language through the
  targets while preserving the standalone distinction.

### Representative states

| State                | Required invariant                                                                                                                              | Allowed variation |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Determinate, partial | Completed and remaining progress are distinguishable from the graphic alone; value attributes present.                                          | Variant.          |
| With value text      | The graphic still satisfies FR1; the text supplements it.                                                                                       | Formatter.        |
| Label hidden         | The bar keeps its accessible name.                                                                                                              | —                 |
| Determinate, touch   | Under a coarse primary pointer the fill moves linearly from where it is drawn, for the role's share; at least 16px above zero; nothing at zero. | Variant.          |
| Indeterminate        | No value attributes; sliding fill; under reduced motion a full-width fill pulses its opacity in place, with no travel.                          | Variant.          |
| With marks           | Ticks outside the `progressbar`, labelled by tooltip.                                                                                           | Mark labels.      |

### Transformation and precedence order

- **ORD1 — Value.** Non-finite → 0; clamp to `[0, max]`; a non-positive `max`
  gives 0%.
- **ORD2 — Presentation.** Resolve determinate or indeterminate first; external
  content never weakens the determinate visual requirement.

### Performance and resources

- **PR1 — No external-content inspection.** ProgressBar adds no DOM
  observation, measurement, or relationship discovery to decide whether nearby
  text makes a weaker bar acceptable. Mark tooltips load lazily.

## Accessibility contract

- **AR1 — Standalone non-text distinction.** A determinate bar satisfies the
  applicable non-text contrast requirement without relying on external visible
  text.
- **AR2 — Programmatic semantics.** The track is a named `progressbar` with
  value semantics while determinate and none while indeterminate, independent
  of the visible treatment.
- **AR3 — Supplementary text is not inferred.** ProgressBar does not claim that
  external text is present, visible, equivalent, or associated.
- **AR4 — The reduced-motion pulse keeps the bar visible.** The indeterminate
  pulse never draws the fill below 0.84 opacity, the lowest opacity at which
  every tone that reaches 3:1 against the track at full opacity still does, in
  the light and dark default themes (lowest: success in dark, 3.01:1 on the
  surface background). Warning and neutral in light fall short even at full
  opacity (Current-state impact; OQ1).

## Design relationships

| Anatomy or state         | Design requirement                                      | Representation authority    | Hierarchy role | Component contract |
| ------------------------ | ------------------------------------------------------- | --------------------------- | -------------- | ------------------ |
| Progress bar             | Arranges the label row and track.                       | Current source and docs     | Supporting     | FR3, FR8           |
| Label and value text     | Name the operation and optionally supplement its value. | Current source and docs     | Supporting     | FR3                |
| Fill and remaining track | Provide a sufficient standalone distinction.            | DEC-1; treatment open (OQ1) | Prominent      | FR1, FR4           |
| Mark                     | An optional labelled target on the track.               | Current source and docs     | Supporting     | FR7                |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Progress bar": {"target": "progress-bar"},
  "Label": {
    "none": {
      "reason": "unsettled: No current public ProgressBar target reaches this part; future target ownership is undecided."
    }
  },
  "Value text": {
    "none": {
      "reason": "unsettled: No current public ProgressBar target reaches this part; future target ownership is undecided."
    }
  },
  "Track": {"target": "progress-bar-track"},
  "Fill": {"target": "progress-bar-fill"},
  "Mark": {"target": "progress-bar-mark"}
}
```

The `Label` and `Value text` dispositions are current facts, not decisions that
those parts stay untargeted.

## Family and system relationships

- `architecture:public-component-api` and `spec:AST-002/DEC-1` govern whether a
  caller-owned distinction justifies a public prop; FR2 applies them.
- `architecture:component-theming-surface` and
  `architecture:theme-authoring-contract` govern targets and theme overrides.
- `architecture:theme-tokens` governs the token vocabulary and forced-colors
  boundaries; FR4 applies INV11.
- `architecture:internationalization` governs Astryx-owned text; FR3 records
  the value-text gap.
- `component:Tooltip` owns the mark tooltip.

## Verification map

| Contract            | Verification                                                                                                                                               | Representative states                                                                                | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                            | Audit section                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| FR1, AR1, AR3       | Stable visual baselines `core-progressbar--default` (neutral) and `core-progressbar--with-target-mark` (probe)                                             | Default; probe theme with a mark                                                                     | A changed fill or track comes back changed for review. Gap: no real-browser contrast check across shipped themes and color modes proves the standalone distinction (OQ1 holds the treatment).                                                                                                                                                                                                                                                                              | `audit:ProgressBar/visual`   |
| FR2                 | Public type and consumer-doc review                                                                                                                        | Current props                                                                                        | Gap: no automated check; a new visual-distinction prop is a review finding.                                                                                                                                                                                                                                                                                                                                                                                                | `audit:ProgressBar/api`      |
| FR3, ORD1, AR2      | `ProgressBar.test.tsx` label, value text, formatter, clamp, zero and NaN tests; `ProgressBar.a11y.test.tsx` and `ProgressBar.a11y.chromium.spec.ts` states | Determinate; formatted; complete; label hidden                                                       | A missing name, a value outside `[0, max]`, a leaked `NaN`, or wrong `aria-valuetext` fails, including at the accessibility tree. Gap: no test checks the default text in a non-English locale.                                                                                                                                                                                                                                                                            | `audit:ProgressBar/a11y`     |
| FR4                 | `ProgressBar.test.tsx` track-clip, transform, variant, and forced-colors tests; `ProgressBarMotion.a11y.chromium.spec.ts`                                  | Every variant; value changes; RTL region; reduced motion; forced colors                              | A track that does not clip, a fill sized by width outside forced colors, a lost forced-colors outline, a leading edge off the value or unmirrored in an RTL region, a value change that does not land at once under reduced motion, or per-frame layout while moving fails. Gap: the variant colors have no direct check. Gap: the "fixed 8px track height" test only checks that the bar renders, so the track height has no check; no test covers a theme-added variant. | `audit:ProgressBar/visual`   |
| FR5                 | `ProgressBar.test.tsx` disabled and disabled-mark tests                                                                                                    | Disabled                                                                                             | A missing label or undimmed marks fail. Gap: the muted fill and label colors have no direct check.                                                                                                                                                                                                                                                                                                                                                                         | `audit:ProgressBar/visual`   |
| FR6                 | `ProgressBar.test.tsx` indeterminate suite                                                                                                                 | Every variant; RTL                                                                                   | Value attributes or value text while indeterminate, a lost label, an unclipped track, or an unmirrored slide fails. No test covers the slide in a left-to-right region inside a right-to-left page. Gap: the RTL test asserts the right-to-left ancestor selector, so it pins the FR6 gap.                                                                                                                                                                                 | `audit:ProgressBar/behavior` |
| FR4 touch timing    | Pending: real-browser computed-animation tests under a coarse and a fine pointer (not yet in the suite)                                                    | Coarse vs fine pointer; 10% to 90%; a new value mid-move; 1% on a narrow track; zero; reduced motion | A coarse-pointer move that eases, starts from the old value instead of the drawn position, or lasts other than `progress.fillTrackMs` times the share moved; a fine-pointer move that leaves the theme's eased duration; a non-zero fill shorter than 16px; a painted fill at zero; or a duration played as a literal instead of the role fails.                                                                                                                           | `audit:ProgressBar/behavior` |
| FR6 reduced motion  | Pending: real-browser computed-animation tests under reduced motion, coarse and fine pointer (not yet in the suite)                                        | Every variant; coarse and fine pointer                                                               | A segment, any transform or travel, a fill narrower than the track, an animated property other than the fill's opacity, an opacity below 0.84, a period other than `progress.reducedMotionPulseMs` each way, or a changed track fails.                                                                                                                                                                                                                                     | `audit:ProgressBar/behavior` |
| AR4                 | Pending: real-browser contrast check of the fill at 0.84 opacity over the track (not yet in the suite)                                                     | Every variant; light and dark default themes; body and surface backgrounds                           | A tone that reaches 3:1 at full opacity and falls below 3:1 at the floor fails. Gap: warning and neutral in light are below 3:1 at full opacity (OQ1).                                                                                                                                                                                                                                                                                                                     | `audit:ProgressBar/a11y`     |
| FR7                 | `ProgressBar.test.tsx` target-mark suite                                                                                                                   | None; one; many; clamped; non-finite; on fill; indeterminate; disabled; tooltip                      | A missing, misplaced, or clipped mark, a mark inside the `progressbar`, a lost tooltip, or a wrong on-fill color fails. Gap: the test asserts that marks have no role and no `aria-label`, which pins the FR7 gap.                                                                                                                                                                                                                                                         | `audit:ProgressBar/a11y`     |
| FR8                 | `ProgressBar.test.tsx` target-name and mark-target tests; `themingTargets.test.ts`                                                                         | Four canonical targets                                                                               | A missing or renamed target fails. Gap: no test covers a caller `data-variant`. `themingTargets.test.ts` catches only a renamed or undocumented target; no check fails if a part stops carrying its target.                                                                                                                                                                                                                                                                | `audit:ProgressBar/theming`  |
| FR9                 | `ProgressBar.test.tsx` ref and `data-testid` tests                                                                                                         | Ref; test id                                                                                         | A ref that is not a `div` or a lost test id fails. Gap: the ref test checks only that the ref is a `div`, not that it is the root, and no test covers DOM props, `className`, `style`, or the `xstyle` merge order.                                                                                                                                                                                                                                                        | `audit:ProgressBar/api`      |
| PR1                 | Source review                                                                                                                                              | Every state                                                                                          | Gap: no automated check fails if ProgressBar starts inspecting nearby content.                                                                                                                                                                                                                                                                                                                                                                                             | `audit:ProgressBar/behavior` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                              | Canonical anatomy and four targets                                                                   | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                                                                                                                                                                                              | `audit:ProgressBar/theming`  |

## Decision log

### DEC-1 — ProgressBar owns a sufficient standalone visual

**Reference:** `component:ProgressBar/DEC-1`  
**Decider:** `cixzhang`, `2026-08-30`

ProgressBar must provide a sufficient standalone visual. Visible text inside or
outside the component may improve understanding, but the bar remains responsible
for communicating completed versus remaining progress without it.

Public API must not make that correctness depend on external content the
component cannot carry, associate, or verify. Solve the component behavior first.
Consider new API only when a stable caller-owned distinction still remains after
the base behavior is correct.

Rejected: weakening the bar based on a caller claim about nearby content. That
would move component correctness into an external condition the component cannot
verify.

### DEC-2 — Touch fill timing and a reduced-motion pulse

**Reference:** `component:ProgressBar/DEC-2`
**Decider:** `cixzhang`, `2026-11-01`

Under a finger a determinate fill moves the way UIKit's progress view does,
because touch presentations default to measured native timing
(`spec:AST-094` DEC-1); a mouse keeps the theme's motion. The indeterminate
bar keeps its 40% eased slide on every pointer. Under reduced motion a
travelling segment still moves, so the bar stops travelling and pulses slowly
in place on every pointer, at a floor that keeps it visible; the slow 2000ms
pulse is an owner value, departing from iOS Safari's measured 1s pulse between
0.30 and 0.60 opacity.

Rejected: iOS Safari's quarter-track sweep for the indeterminate bar under a finger.

## Open questions

- **OQ1 — What exact visual treatment gives every determinate presentation a
  sufficient standalone completed-versus-remaining distinction across supported
  variants, themes, and color modes?** (`human-design`)

## Content boundary

This file does not duplicate consumer prop tables or examples, current audit
results, implementation steps, exact visual values, or system theming rules. It
links to their owners.
