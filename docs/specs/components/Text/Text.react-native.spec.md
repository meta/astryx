---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Text
platform_of: component:Text
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers: [public-api, behavior, theming, accessibility, platform]
verified_by: []
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# Text (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Web's `Text` props `type`, `children`, `size`, `color`, `weight`, `maxLines`, `justify`, `hasStrikethrough`, `hasTabularNumbers` and `hasTruncateTooltip`, without `as`, `display`, `wordBreak`, `textWrap`, `hasCapsize` and `xstyle`. React Native adds the status colours `success`, `warning`, `error` and `info`, `hasShrinkToFit` with `minimumScale`, and `maxFontSizeMultiplier`. |
| Behavior                | One platform text view styled from the theme's type scale; `inherit` takes the surrounding owner's text. Each type grows with the person's text size, on its Dynamic Type ramp on iOS and with the font scale on Android. `maxLines` ends the text with an ellipsis; `hasShrinkToFit` shrinks it to fit instead.                                                                          |
| End-user impact         | A person reads the same type scale as on the web, at the text size they chose, and VoiceOver and TalkBack read every word, cut-off words included.                                                                                                                                                                                                                                        |
| Builder impact          | Web code that renders `Text` with string children ports unchanged unless it passes one of the six web layout and styling props. A figure that must stay whole uses `hasShrinkToFit`; a fixed-height row may cap its own text growth with `maxFontSizeMultiplier`.                                                                                                                         |
| Compatibility/readiness | Not released. Draft. The web contract is unchanged. Gap lines under FR1, FR3 and FR4.                                                                                                                                                                                                                                                                                                     |
| Review checks           | Reject a type that ignores the text-size setting, a colour taken from outside the theme, a library limit on text growth, truncated words that a screen reader cannot reach, or a prop accepted and ignored.                                                                                                                                                                               |
| Governing rules         | `component:Text`; `architecture:component-theming-surface`; `spec:AST-082` FR3, FR5, FR7, FR11; `spec:AST-093` FR1–FR5.                                                                                                                                                                                                                                                                   |

This table is a review projection; the body below is authoritative.

## Intent

Text on React Native is web's themed words: the same types, sizes, colours,
weights and clamping, drawn by the platform's own text view so the person's
text size, the screen readers and the platform's line breaking work as they
do everywhere else on the phone.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a new platform contract; the web contract is unchanged)
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- How React Native renders web's `Text`: its props, the type scale on the
  platform's text view, and growth with the text size (FR1, FR3).
- The status colours, shrink to fit and the app's text-size limit (FR2).
- Truncation and what screen readers read of cut-off words (FR4).

**Does not own / non-goals**

- The meaning of the web props and the type scale — owned by
  `component:Text`.
- Typography token values — owned by the active theme.
- Heading — owned by `component:Heading`.
- The truncation tooltip's surface — owned by `component:Tooltip`.

## Public concepts

| Concept         | Closed values or states                                                                                       | Meaning                                                                            | Availability by variant/orientation/state | Default                                           | Owner                         | Stability    | Invalid-value behavior           |
| --------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------- | ----------------------------- | ------------ | -------------------------------- |
| `type`          | `body`, `large`, `label`, `supporting`, `code`, `display-1`, `display-2`, `display-3`, `inherit`              | size, weight and line height from the theme                                        | always                                    | `body`                                            | `component:Text`              | experimental | an unknown value is a type error |
| `color`         | `primary`, `secondary`, `disabled`, `placeholder`, `accent`, `inherit`, `success`, `warning`, `error`, `info` | the text colour from the theme                                                     | always                                    | `secondary` for `supporting`, `primary` otherwise | `component:react-native/Text` | experimental | an unknown value is a type error |
| truncation      | none; clamped; shrunk                                                                                         | words past `maxLines` end with an ellipsis, or shrink to fit with `hasShrinkToFit` | always                                    | none                                              | `component:react-native/Text` | experimental | none                             |
| text-size limit | none; the app's multiplier                                                                                    | how far the person's text size grows these words                                   | always                                    | the owner's limit, else none                      | `component:react-native/Text` | experimental | a value under 1 is ignored       |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Basis                                                                                   | Draft review state |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------ |
| FR1 | React Native's `Text` MUST take web's `type`, `children`, `size`, `color`, `weight`, `maxLines`, `justify`, `hasStrikethrough`, `hasTabularNumbers` and `hasTruncateTooltip` with web's names, defaults (`body`, no clamp, `start`, the tooltip on) and meaning, and the additions of FR2, and no other props. `children` are the words. Base props follow `spec:AST-082` FR7. It MUST NOT offer a prop it does not honor: `as` chooses a web element, while a platform text view is one element; `display`, `wordBreak`, `textWrap` and `hasCapsize` are CSS layout and line breaking, while native text breaks and places its lines by the platform's rules; and `xstyle` is web styling.                                                                                                                                                                                         | `component:Text` FR1, FR5; `spec:AST-082` FR3, FR5, FR7                                 | verify             |
| FR2 | React Native MUST add, each for a platform reason: the colours `success`, `warning`, `error` and `info`, which draw the theme's status text colours, because a status line on a phone has no CSS colour to take; `hasShrinkToFit`, which shrinks the words to fit `maxLines` (one line when `maxLines` is 0) instead of cutting them, down to `minimumScale` of their size (0.1 to 1, default 0.6) and never below the size they have at the default text size, as the platform's shrink to fit does, for a heading or figure that must stay whole; and `maxFontSizeMultiplier`, the app's own limit on how far the person's text size grows these words (1 or more; default the surrounding owner's limit, else none), with the line height following the limited size, for a fixed-height row. The library sets no text-size limit of its own. An unset addition changes nothing. | `spec:AST-082` FR5, FR11; `spec:AST-093` FR2                                            | verify             |
| FR3 | Text MUST render one platform text view styled from the theme: `type` sets the size, line height and weight, and the colour defaults to `secondary` for `supporting` and `primary` otherwise; `size` replaces the type's size and keeps its line-height ratio; `weight` replaces its weight in the type's font family; a theme's own family for a type applies; `color` replaces the default. `inherit` takes the surrounding owner's size, weight, line height or colour, and reads as body text in `primary` with no owner. Each type grows with the person's text size: on iOS on its Dynamic Type ramp, on Android with the font scale. `justify` `start` follows the container, `center` centres each line and `end` ends each line at the inline end. `hasStrikethrough` draws a line through the words and `hasTabularNumbers` uses tabular figures.                         | `component:Text` FR1–FR3; `architecture:component-theming-surface`; `spec:AST-082` FR11 | verify             |
| FR4 | `maxLines` above 0 MUST end the words after that many lines with an ellipsis at the tail; 0 does not clamp. Cut-off words stay the text view's content, so VoiceOver and TalkBack read them all. When the words are cut and `hasTruncateTooltip` is not `false`, the full words show in a tooltip anchored to the text, opened by a tap as `component:Tooltip` FR5 states for a trigger that performs no action.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `component:Text` FR4; `component:Tooltip` FR5                                           | verify             |

The gap lines below describe `@astryxdesign/react-native`, the package that
implements this record.

- FR1 gap: the package does not offer `hasTruncateTooltip`.
- FR1 gap: the package's `type` and `color` take only the built-in values;
  a theme-added type or colour is a type error, where web draws it on the body
  and primary baselines.
- FR3 gap: `justify="end"` moves the text's box to the end edge, so the lines
  of a wrapping text stay start-aligned inside it.
- FR4 gap: cut-off words show in no tooltip.

### Allowed variation

- **AV1 — Platform text.** Line breaking, hyphenation, the ellipsis glyph and
  font rendering are the platform text view's own.

### Representative states

| State                                               | Required invariant                                                        | Allowed variation  |
| --------------------------------------------------- | ------------------------------------------------------------------------- | ------------------ |
| default                                             | body type in `primary`                                                    | content            |
| `supporting`                                        | supporting type in `secondary`                                            | a `color` override |
| `inherit` inside a Button                           | the Button's size, weight and colour                                      | none               |
| largest text size                                   | each type on its ramp, no library limit                                   | AV1                |
| `maxFontSizeMultiplier={1.2}` at a larger text size | the words stop growing at 1.2 times, the line height with them            | none               |
| `maxLines={1}`, long words                          | one line ending in an ellipsis; every word read aloud                     | AV1                |
| `hasShrinkToFit`, `maxLines={1}`                    | one line, shrunk no further than `minimumScale` or the default-size floor | AV1                |
| `color="error"`                                     | the theme's error text colour                                             | none               |

### Transformation and precedence order

- **ORD1 — Type.** `inherit` → the owner's text, else body; otherwise the
  type's size, line height and weight, then `size` and `weight`.
- **ORD2 — Colour.** `color` → the type's default (`secondary` for
  `supporting`, else `primary`); `inherit` → the owner's colour, else
  `primary`.
- **ORD3 — Text-size growth.** The person's text size, limited by
  `maxFontSizeMultiplier`, else the owner's limit, else unlimited.
- **ORD4 — Fit.** `hasShrinkToFit` → shrink within `maxLines`; else
  `maxLines` above 0 → an ellipsis; else no clamp.

### Performance and resources

- **PR1 — One view.** Text is one platform text view with no measurement,
  listener or render pass of its own.

## Accessibility contract

- **AR1 — Platform text.** VoiceOver and TalkBack read Text as the platform
  reads text, its words in order.
- **AR2 — Every word reachable.** Words cut off by `maxLines` stay readable by
  screen readers (FR4).
- **AR3 — Text size.** Every type follows the person's text size with no
  library limit; only the app's own `maxFontSizeMultiplier` caps it (FR2,
  FR3).

## Design relationships

| Anatomy or state | Design requirement                                 | Representation authority   | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Words            | the theme's type scale on the platform's text view | prescribed by core         | prominent      | FR3                |
| Ellipsis         | the platform's tail truncation                     | prescribed by the platform | supporting     | FR4                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): the platform's text view through
React Native's `Text`. Guideline pages (`spec:AST-093` FR3): Typography and Accessibility
(Dynamic Type) in the Apple Human Interface Guidelines.

Theme values read (`spec:AST-093` FR4): the type scale's sizes, line heights,
weights and font families, the text colours `primary`, `secondary`,
`disabled`, `placeholder` and `accent`, the status text colours, and the
theme's component overrides for Text.

## Family and system relationships

- `component:Text` owns the props, types and colours; this record states only
  what React Native adds or does differently.
- `architecture:component-theming-surface` owns how a theme's overrides reach
  Text.
- `component:Tooltip` owns the tooltip that shows cut-off words.

## Verification map

| Contract | Verification                                                                                                        | Representative states                                                                                                  | Mutation or failure expectation                                                                                                                                 | Audit section                        |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| FR1, FR2 | Type tests of the exports against web's types; a contract drift test                                                | each prop; the six web props absent; each addition unset                                                               | a missing web prop, a different default, an accepted and ignored prop, or an addition that changes unset text fails                                             | `audit:react-native/Text/api`        |
| FR3      | Unit tests of the type scale, overrides and `inherit`; captures in each theme at the default and largest text sizes | each type, size and weight; `inherit` inside an owner and alone; each `justify`; strikethrough and tabular figures     | a type that does not grow with the text size, a size that loses its line-height ratio, an `inherit` that ignores its owner, or a colour outside the theme fails | `audit:react-native/Text/type`       |
| FR2      | Unit tests of shrink to fit and the text-size limit on iOS and Android                                              | `hasShrinkToFit` at each `maxLines`; `minimumScale` bounds; a larger text size; a multiplier below 1; an owner's limit | a shrink below the default-size floor, a library limit with no multiplier set, or a line height that does not follow the limited size on Android fails          | `audit:react-native/Text/scale`      |
| FR4, AR2 | Unit tests of truncation; VoiceOver and TalkBack checks                                                             | `maxLines` 0, 1 and 3 with long words                                                                                  | a clamp that cuts without an ellipsis, or cut-off words a screen reader cannot read, fails                                                                      | `audit:react-native/Text/truncation` |
| AR1, AR3 | VoiceOver and TalkBack checks on the Simulator, the emulator and devices                                            | each type at the largest text size                                                                                     | words read out of order, or a type capped with no multiplier set, fails                                                                                         | `audit:react-native/Text/a11y`       |

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
