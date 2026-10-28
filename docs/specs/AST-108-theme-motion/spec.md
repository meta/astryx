---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-108
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
phase: accepted
owners: [cixzhang]
affects_architecture:
  [
    architecture:theme-tokens,
    architecture:theme-authoring-contract,
    architecture:theme-application,
  ]
affects_families: []
affects_contributing: []
affects_consumer_docs: [motion, tokens, theme]
---

# Theme motion system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/core/src/theme/**", "packages/core/src/motion/**"]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A theme sets how fast and how lively its motion feels, and whether motion is
reduced for everyone, with three knobs. The same knobs drive the CSS motion
tokens and the animator's springs and curves, and animations that run together
start and land together. Every per-use motion value stays internal.

## Non-goals

- Per-role or per-component motion settings for themes.
- Loosening Reduce Motion: no option turns off `design:reduced-motion`
  DR1–DR4 for a person who asked for it.
- A public resolver for a theme's motion values (OQ1).

## Public contract

```ts
defineTheme({
  name: 'Brand',
  motion: {tempo: 1, character: 'standard', reducedMotion: 'system'},
});
```

## Requirements

- **FR1 — Three motion knobs.** `defineTheme`'s `motion` takes
  `{tempo, character, reducedMotion}`:
  - `tempo` is a number, default `1`, clamped to 0.75–1.5; it scales every
    motion duration;
  - `character` is `'crisp'`, `'standard'` (default), or `'expressive'`; it
    picks the entrance and move curves and the spring bounce. A continuous bounce
    is not offered;
  - `reducedMotion` is `'system'` (default) or `'always'`; `'always'` applies
    `design:reduced-motion` DR1–DR3 for everyone, and `'system'` follows each
    person's setting. No value loosens Reduce Motion.
- **FR2 — The knobs generate the CSS motion tokens.** The theme's
  `--duration-*` tokens are their base values times `tempo`. `character` sets
  only the job-named `--ease-entrance` and `--ease-move` tokens, declared in
  `tokens.stylex.ts`. `--ease-standard`, which the existing exits read, and
  `--ease-exit`, whose default is `cubic-bezier(0.3, 0, 0.6, 0.6)`, are the same at every character, so exits stay
  quiet. With `tempo` 1 and `character`
  `'standard'`, the tokens keep their released values: `--duration-*` 130, 175, 230, 310, 410,
  550, 730, 975 and 1300 ms, and `--ease-standard`
  `cubic-bezier(0.24, 1, 0.4, 1)`; `--ease-entrance` and `--ease-move` equal
  `--ease-standard` at `'standard'`. The curves at `'crisp'` and
  `'expressive'` are a decelerate-only curve and a curve with a slight
  overshoot.
- **FR3 — The animator's tables derive from the same knobs.** The animator's
  base tables, every role in `spec:AST-094` FR4, derive from the theme's
  `tempo` and `character` at their source: a spring's duration scales by
  `tempo`, and `character` offsets the role's measured bounce by an amount
  times the role's fixed weight: `'standard'` adds nothing, and `'crisp'` and
  `'expressive'` shift it down and up, so a role whose weight is zero, such as
  an exit, a fade, or a full-screen move, keeps its measured bounce at every
  character. With
  `tempo` 1 and `character` `'standard'`, every role plays its measured value
  exactly. A spring keeps its measured physics, scaled by `tempo` and shaped
  by `character`; it does not follow a CSS duration or easing twin. The roles
  and their weights stay internal.
- **FR4a — Coordinated animations share one clock.** Animations that run
  together start and land together: they play the same motion role, or the CSS
  part is timed from the spring's computed settle time, and never as two
  independently timed curves. This covers an element and the siblings that
  glide around it (`spec:AST-105`'s one shared timing), an element's
  entrance and its exit, a sheet and its scrim, a menu's grow and its content, and a CSS fade
  paired with a JavaScript spring, such as MobileNav's close timed from its
  computed duration and BottomSheet's scrim, whose fade lasts the sheet's
  computed settle time.
- **FR4 — Some motion is fixed on purpose.** `tempo` and `character` do not
  move
  finger-following and drag motion, scroll momentum and decay, the rubber
  band, the on-screen keyboard's motion (`spec:AST-099` FR8), the press
  model's clocks (its onset delay, cancel distance, and tap flash), hover-intent
  delays, gesture thresholds (`spec:AST-002` FR3), the loop periods of busy
  indicators such as Spinner and Skeleton, which read the duration their theme
  sets before `tempo` scales it, so a `MotionScaleConfig` still times them,
  or the 200 ms Reduce Motion cap; `tempo` may shorten a
  Reduce Motion cross-fade but never lengthens it.
- **FR5 — Existing motion configuration keeps working.** `defineTheme`'s
  `motion` also accepts the existing `MotionScaleConfig`, and
  `expandMotionScale` and the `MotionScale*` types are unchanged. A
  `MotionScaleConfig` keeps generating its CSS duration tokens, and the tempo
  it implies drives those durations only: the animator's tables stay at tempo 1
  unless the theme sets `tempo` itself, so an existing theme renders exactly as
  before, springs included. Explicit
  `MotionScaleConfig` fields and explicit `tokens` win over `tempo` and
  `character`, and an extending theme inherits field by field: a `MotionScaleConfig` field
  or a knob the child leaves unset keeps its base's value. An adaptation rule may set `tempo` and `character` like
  any other `motion` value (`spec:AST-012` FR4); `reducedMotion` is set on the
  theme itself, since its root mark has no conditional form.
- **FR6 — Server rendering gets the same values.** A theme is plain data, and
  the theme utilities run on the server. `'system'` adds no theme CSS:
  component styles already key reduced motion on `prefers-reduced-motion`, so
  the server never guesses and nothing flashes at hydration. `'always'` marks
  the theme's root, and every component style that keys reduced motion on
  `prefers-reduced-motion` also keys it on that mark; the animator, every script reader of
  `prefers-reduced-motion` (a `matchMedia` or `useMediaQuery` check), and every
  adaptation rule keyed on `when: {motion}` (`spec:AST-012` FR2) treat the
  preference as set. The mark only adds: an ancestor's `'always'` reaches
  inside every nested theme, and a nested theme can add `'always'` but never
  removes an ancestor's, since nothing loosens `design:reduced-motion` DR1–DR3
  (DR2a). The server and the client resolve the same
  motion values from a theme, and importing the theme and motion modules
  touches no DOM (`architecture:theme-authoring-contract`). The animator reads a person's Reduce Motion
  setting only when an animation starts, on the client.
- **FR7 — Docs ship with it.** The motion, duration-token, and easing-token
  docs, the theme template, the theme-authoring guide, and
  `architecture:theme-authoring-contract` describe the three knobs, the fixed
  list, and the precedence before the implementation lands.

## Current-state impact

- `defineTheme`'s `motion` widens to accept the three knobs beside the existing
  `MotionScaleConfig`; existing themes render exactly as before.
- Core gains `--ease-entrance`, `--ease-move`, and `--ease-exit`, and a
  theme-root mark for `reducedMotion: 'always'` that every component style
  keying reduced motion on `prefers-reduced-motion` also keys on; Carousel's
  paging, BottomSheet's panel and sheet gestures, Item's swipe release,
  MobileNav, AppShell, Chat, Markdown's streaming reveal, BottomSheet's
  keyboard scroll, and the animated-layout glide, which read the preference in
  script, also honour it, as do adaptation rules keyed on `when: {motion}`
  (`spec:AST-012`).
- `design:reduced-motion` gains DR2a: a theme may reduce motion for everyone.
- Spinner and Skeleton read their loop durations before `tempo` scales them
  (FR4), so their timing is unchanged under every existing theme;
  `component:Spinner` FR3 and `component:Skeleton` FR4 say so.
- BottomSheet's sheet and scrim share `--duration-medium`; when the
  sheet settles on `springs.settle`, its scrim's fade takes the spring's settle
  time (FR4a).
- `spec:AST-094` FR1, FR4, and DEC-15, `design:reduced-motion` DR2a,
  `spec:AST-012` FR4 (`reducedMotion` stays root-owned),
  `architecture:theme-application` INV1 (`'always'` reaches nested
  providers), `architecture:theme-authoring-contract` (the internal motion resolver),
  `component:Button` FR15 (its release fade follows `tempo`), the draft `design:motion` DR3, and `spec:AST-090` are amended to
  match.

## Verification

| Contract | Verification                                                                         | Representative states                                                                                                                                                                                                         | Mutation or failure expectation                                                                                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR2 | Theme unit tests over generated CSS                                                  | each `tempo` bound and 1; each `character`; `reducedMotion` both values; no `motion`                                                                                                                                          | a token off its formula, the released tokens changed at the defaults, an exit curve that changes, or a value outside a clamp fails                                                                                                                                                     |
| FR3      | Tests that the CSS tokens and the animator's tables derive from the same knob values | each role at the defaults and at each knob value; an adaptation rule that sets `tempo` or `character`                                                                                                                         | a role off its measured value at the defaults, a role that ignores a knob it follows, or a weight-0 role whose bounce changes with `character` fails                                                                                                                                   |
| FR4a     | Browser tests of each paired animation at each knob value                            | an element and gliding siblings, an element's entrance and exit, a sheet and its scrim, a menu's grow and content, a CSS fade with a spring                                                                                   | paired animations that end more than one frame apart fail                                                                                                                                                                                                                              |
| FR4      | Unit tests of each fixed item                                                        | finger tracking, momentum, rubber band, keyboard, press and hover clocks, loops, Reduce Motion cap; Spinner and Skeleton loops at each tempo                                                                                  | a fixed item that moves with `tempo` or `character`, or a cross-fade longer than 200 ms, fails                                                                                                                                                                                         |
| FR5      | Theme tests with the released configurations                                         | a `MotionScaleConfig` theme, explicit tokens, an extending theme; an adaptation rule that sets `tempo` or `character`                                                                                                         | changed output for an existing theme, or a knob that beats an explicit field, fails                                                                                                                                                                                                    |
| FR6      | Server-render tests and import checks                                                | a server render with each `reducedMotion`; importing the theme and motion modules; `'always'` with the person's setting off, across components that key on `prefers-reduced-motion`; a nested theme under an `'always'` theme | a DOM access at import or on the server, theme CSS emitted for `'system'`, a hydration change, or a component style, script reader, or `when: {motion}` rule that ignores the root mark under `'always'`, or a nested theme that restores motion under an ancestor's `'always'`, fails |
| FR7      | Docs review                                                                          | each listed doc                                                                                                                                                                                                               | a doc without the knobs, the fixed list, or the precedence fails                                                                                                                                                                                                                       |

## Decision log

### DEC-1 — A theme's motion is three knobs; per-role tables stay internal

**Reference:** `spec:AST-108/DEC-1`
**Decider:** `cixzhang`, `2026-10-26`

Theme authors set how fast and how lively motion feels and whether it is
reduced for everyone; few want per-use values. Three character steps, not a continuous bounce,
are the recommendation adopted with the knobs. Three knobs drive CSS tokens and JavaScript springs from the same values, and the measured
per-role values stay internal. This supersedes `spec:AST-094` DEC-11's "all
internal" for exactly these three knobs.

Rejected: a public token per motion group.

## Open questions

- **OQ1 — Whether a theme's motion values get a public resolver.**
  (`human-design`) Open. `resolveThemeMotion` is internal.
