---
schema_version: 3
template_version: 7
kind: component
id: component:ChatDictationButton
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, theming, testing]
verified_by:
  [
    packages/core/src/Chat/ChatDictationButton.test.tsx,
    apps/storybook/stories/ChatDictation.stories.tsx,
    apps/storybook/rtl-audit/verified-not-applicable.json,
  ]
modules: []
families: []
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:public-component-api,
    architecture:component-style-authoring,
    architecture:theme-tokens,
    architecture:component-test-sufficiency,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs: [spec:AST-029, spec:AST-027]
---

# ChatDictationButton component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `ChatDictationButton` with a required `dictation` state (`isSupported`, `isListening`, `volume`, `bands`, `toggle`), `size` (`sm`, `md`; default `md`), `isHiddenWhenUnsupported` (default true), `label`, `ref`, `xstyle`, `className`, `style`, and span props. |
| Behavior                | An icon-only microphone Button that toggles dictation. While listening it shows five volume-reactive bars instead of the microphone; unsupported dictation renders nothing, or a disabled Button when kept visible.                                               |
| End-user impact         | Voice input is one labelled button that says whether it starts or stops dictation; browsers without speech recognition see no action that cannot run.                                                                                                             |
| Builder impact          | None.                                                                                                                                                                                                                                                             |
| Compatibility/readiness | Records shipped behavior; no public change. Two implementation gaps, listed under Current-state impact.                                                                                                                                                           |
| Review checks           | Reject an enabled unsupported action, a missing or stale start/stop name, bars exposed to assistive technology, or clipping color that a theme cannot retint.                                                                                                     |
| Governing rules         | `architecture:public-component-api`; `architecture:theme-tokens` INV3; `architecture:component-style-authoring` INV7; `design:reduced-motion`.                                                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

ChatDictationButton is the visible control for a speech-recognition state
owner. It turns that owner's support and listening state into one icon-only
Button and a five-bar volume display. Consumer usage lives in
`ChatDictationButton.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: listening state is owned by the supplied
  `dictation` value
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **The volume bars are extra elements.** The listening display is a container
  and five bar `span` elements that no theme target paints.
  `architecture:component-style-authoring` INV7 renders one element per
  semantic role or themable part.

- **The bars set a z-index without isolation.** The bar container carries
  `z-index: 1` and the wrapper does not isolate it, so the bars take part in
  the page's stacking order. `spec:AST-027` FR1 keeps z-index local and lists
  this case as a containment gap.

## Ownership boundary

**Owns**

- The start and stop name, and the caller's `label` override (FR1, FR2).
- Hiding or disabling the control when speech recognition is unsupported
  (FR3).
- The five-bar display of the supplied bands and its clipping color (FR2, FR4).
- The wrapper span's ref, props, and styling (FR5).

**Does not own / non-goals**

- Speech recognition support detection, lifecycle, transcripts, errors, and
  microphone permission — owned by the `dictation` state owner.
- Activation, focus, disabled semantics, and icon-only presentation — owned by
  `component:Button`.
- Placement in ChatComposer — the caller's composition.
- A public color, threshold, or bar-shape option.

## Public concepts

| Concept   | Closed values or states                                  | Meaning                                                    | Availability by variant/orientation/state | Default                 | Owner                           | Stability | Invalid-value behavior           |
| --------- | -------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------- | ----------------------- | ------------------------------- | --------- | -------------------------------- |
| Support   | supported; unsupported and hidden; unsupported and shown | Whether the control renders and whether it can operate.    | Every control.                            | hidden when unsupported | `component:ChatDictationButton` | Stable    | TypeScript rejects other values. |
| Listening | idle; listening                                          | Selects the start or stop name and the microphone or bars. | Supported controls.                       | idle                    | `dictation` owner               | Stable    | Not applicable.                  |
| Size      | `sm`, `md`                                               | Sizes the Button and bars together.                        | Every control.                            | `md`                    | `component:ChatDictationButton` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                          | Basis                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| FR1 | When supported and idle, the control is an enabled, icon-only ghost Button with the microphone icon, named by `label` or the translated start label, that calls `dictation.toggle` when activated. | Current source and tests                |
| FR2 | While listening, the Button is named by `label` or the translated stop label and shows no icon, and five bars, hidden from assistive technology, scale with the supplied `bands`.                  | Current source and tests                |
| FR3 | When dictation is unsupported, the control renders nothing; with `isHiddenWhenUnsupported={false}` it renders a disabled Button.                                                                   | Current source and tests                |
| FR4 | The bars use `--color-accent`, blending toward `--color-error` as `volume` passes the clipping threshold, so a theme retints both ends (`architecture:theme-tokens` INV3).                         | Current source and tests                |
| FR5 | `ref`, DOM, data, and ARIA props, `className`, `style`, and `xstyle` reach the wrapper span, which carries the `chat-dictation-button` target; `size` sizes the Button and the bars together.      | Current source and tests                |
| FR6 | Under reduced motion the bars change scale and color at once, with no transition.                                                                                                                  | `design:reduced-motion`; current source |

### Allowed variation

- **AV1 — Label.** Callers may replace the translated start and stop name.
- **AV2 — Bars.** Bar heights and clipping strength follow the supplied
  `bands` and `volume`.
- **AV3 — Theme colors.** Themes may change the accent and error colors.

### Representative states

| State                     | Required invariant                             | Allowed variation |
| ------------------------- | ---------------------------------------------- | ----------------- |
| Supported, idle           | Enabled microphone Button with the start name. | Label, size.      |
| Listening                 | Stop name; five hidden bars.                   | Bar heights.      |
| Clipping                  | Bars blend from accent toward error.           | Theme colors.     |
| Unsupported, default      | Nothing renders.                               | —                 |
| Unsupported, kept visible | A disabled Button.                             | Label.            |

### Transformation and precedence order

- **ORD1 — Name.** The caller's `label`, then the translated start or stop
  label for the listening state.
- **ORD2 — Support.** Unsupported and hidden renders nothing before any other
  state applies.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Name.** The control always has a name that says whether it starts or
  stops dictation, unless the caller overrides it (FR1, FR2).
- **AR2 — Decorative bars.** The bars are hidden from assistive technology
  (FR2).
- **AR3 — Unavailable action.** A visible unsupported control is disabled
  (FR3); Button owns how disabled is conveyed.

## Design relationships

| Anatomy or state | Design requirement                                 | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Button           | Icon-only microphone action.                       | `component:Button`       | Prominent      | FR1, FR3           |
| Volume bars      | Five bars that show live input level and clipping. | Current source           | Supporting     | FR2, FR4, FR6      |

No anatomy-theming map is recorded yet; the block is optional during
migration, so the map is deferred.

## Family and system relationships

- `component:Button` owns activation, focus, disabled semantics, and icon-only
  presentation.
- `architecture:theme-tokens` owns the accent and error roles the bars use.
- `design:reduced-motion` owns the reduced-motion rule FR6 follows.
- The glyph and centered bars are direction-neutral; the RTL audit records
  this as not applicable.

## Verification map

| Contract | Verification                                                                                          | Representative states         | Mutation or failure expectation                                         | Audit section                             |
| -------- | ----------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| FR1, AR1 | `ChatDictationButton.test.tsx` "labels and toggles the idle button"                                   | Idle                          | A missing name, or activation that does not toggle, fails.              | `audit:ChatDictationButton/behavior`      |
| FR2, AR2 | `ChatDictationButton.test.tsx` "shows five hidden visualizer bars and the stop label while listening" | Listening                     | A wrong bar count, exposed bars, or a start name while listening fails. | `audit:ChatDictationButton/behavior`      |
| FR3, AR3 | `ChatDictationButton.test.tsx` unsupported tests                                                      | Unsupported, hidden and shown | A rendered or enabled unsupported control fails.                        | `audit:ChatDictationButton/accessibility` |
| FR4      | `ChatDictationButton.test.tsx` "uses theme-owned colors for clipping feedback"                        | Clipping                      | A raw color in place of the theme roles fails.                          | `audit:ChatDictationButton/theming`       |
| FR5      | `ChatDictationButton.test.tsx` "forwards the root ref and accepted span props"                        | Ref and span props            | A dropped ref or prop fails.                                            | `audit:ChatDictationButton/api`           |
| RTL N/A  | `apps/storybook/rtl-audit/verified-not-applicable.json`                                               | —                             | —                                                                       | `audit:ChatDictationButton/rtl`           |

Read from source, with no focused test yet:

- FR1: the ghost variant and the microphone icon.
- FR2: no icon while listening, the bars scaling with `bands`, and the
  caller's `label` while listening.
- FR4: the plain accent below the clipping threshold.
- FR5: ARIA props reaching the wrapper, `className`, `style`, and `xstyle` composing on the wrapper, the
  `chat-dictation-button` target, and `sm` sizing.
- FR6: the reduced-motion transition removal.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, speech-recognition
behavior, or Button's rules. It links to their owners.
