---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-102
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:theme-tokens]
affects_families: [family:input-fields]
affects_contributing: []
affects_consumer_docs: []
---

# Typography stays theme-owned system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/core/src/**", "packages/lab/src/**", "packages/themes/**"]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

People who set their own text size see it in every Core and Lab web
component, whatever the theme; people who have not set one see exactly the
font family and size the theme chose. No component swaps in a platform font or
its own text size. Where a shipped Astryx theme has no brand typeface for body
text, it can use the platform's own body font, so text reads like the rest of
the person's device.

## Non-goals

- Which typeface a branded theme uses; a brand keeps its own.
- The type scale itself: `design:typography-hierarchy` and
  `design:mobile-typography` own roles, sizes, and the mobile reading base.

## Requirements

- **FR1 — Components never override typography.** No Core or Lab web
  component sets the font family, font size, or line height of text it renders
  except through the theme's typography tokens; a value inherited from the
  surrounding text conforms. That includes platform font keywords such as `-apple-system-body`
  and system font stacks: a component never applies one directly, on any
  pointer. A hidden internal element that only measures a platform text style
  renders no text and conforms. A font size that sizes an icon, such as a `1em` icon at a
  `spec:AST-087` FR10 size, is not text typography. Native components follow
  the platform's own text settings (`spec:AST-082` FR11). Values a component
  sets come only from the theme. The one
  exception is a size floor a current family record requires, such as the iOS
  16 px text-entry floor of `family:input-fields` FR9.
- **FR2 — Unbranded shipped themes may use the system body font.** An Astryx
  shipped theme whose body font is not branded MAY set its body font token to
  the platform's system body font family, such as `system-ui` or Apple's
  system font. A branded theme
  keeps its brand font for body text. The choice lives in the theme's token
  value, so components pick it up without change (FR1).

- **FR3 — A text size the person set wins; otherwise the theme's.** When the
  person has set a text size, through iOS Dynamic Type, the Android font scale,
  the browser's default font size, or zoom, Core and Lab web text follows it in
  every theme, branded included: the theme's sizes scale from the person's
  size, each role keeps its order, and the family stays the theme's. When the
  person has not set one, or the platform gives no signal, text uses exactly
  the theme's family and size. Following the setting adds no public theme
  option, prop, or document attribute and does not change the document-root
  font size (`design:mobile-typography` DR4). A size the person set
  replaces the mobile reading base of `design:mobile-typography` DR1, smaller
  or larger, and DR2's pin does not apply: every role scales from that size;
  DR1 and DR2 apply when none is set, and the iOS text-entry floor of
  `family:input-fields` FR9 still holds.
- **FR4 — Larger text stays usable.** Up to 200% of the theme's sizes, every
  component keeps all of its content and function (WCAG 2.2 success criterion
  1.4.4). Above 200%, reading text keeps growing; a label inside a dense control, such
  as a tab, badge, table cell, or segmented control, MAY stop growing at 200%.
  A control grows with its text rather than holding a fixed height, so its
  height never clips a label; a truncation a component record already defines,
  such as the ellipsis of `component:Badge` FR3, `component:Button` FR5, or
  `component:Token` FR7, still applies.

### Platform support

- Supported feature/engine floor: the package's supported browsers
  (`spec:AST-013` FR1, FR3). Platform font keywords that an engine does not
  recognize fall back to the rest of the theme's font stack.
- Unsupported behavior: none beyond the font fallback above.
- Browser evidence (`spec:AST-013` FR10): Safari on iOS proves an FR2 theme's
  body text in the system body font and FR3 across Dynamic Type categories;
  Chrome on Android in the emulator proves FR3 with the system font scale; a
  desktop browser proves FR3 with its default font size and zoom, and FR4 at
  200% and above; token and source checks prove FR1.

## Current-state impact

- Core's default body font is the system font stack, an unbranded value FR2
  allows. Each shipped theme package sets a brand body font and keeps it.
- Some components set typography outside the theme today, such as Lab's
  Sankey labels using `system-ui` directly and several Core and Lab components
  setting their own sizes or line heights; under FR1 those are conformance
  gaps.
- `architecture:theme-tokens`: text size tokens stay rem; Butter, Stone, and
  Y2K's 12 px supporting-size token is the token-level gap below. Spacing and
  element size tokens keep their values when a size is set; a control grows
  with its text under FR4.
- Defects under FR3 and FR4:
  - On iOS and iPadOS, text ignores Dynamic Type in every theme.
  - Butter, Stone, and Y2K fix supporting text at 12 px, so it does not follow
    a larger browser or Android text size.
  - Controls hold fixed heights, such as 40 px elements, `component:Badge`
    FR1's block size, `component:Button` FR4's and `component:Token` FR1's
    element sizes, and InputGroup's row height in `family:input-fields`, so a
    larger label can overflow; those records treat their sizes as minimums
    under FR4.
  - Whether Chrome on Android carries the system font scale to Astryx text is
    unverified until the emulator check FR3 names.

## Verification

| Contract | Verification                                                                                                                                                                   | Representative states                                                                                                                                                                 | Mutation or failure expectation                                                                                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Source check over Core and Lab component styles plus token review                                                                                                              | family, size, and line height of rendered text in component styles; an inherited value; a `1em` icon size; coarse and fine pointer; a platform font keyword; the iOS text-entry floor | A Core or Lab web component sets the family, size, or line height of text it renders outside typography tokens and not by inheritance, or applies a platform font keyword directly; icon sizing, the family floor, and a hidden internal element that only measures a platform text style are not failures |
| FR2      | Theme token review plus Safari on iOS, top-level document                                                                                                                      | an unbranded shipped theme using the system body font family; a branded theme; the default theme                                                                                      | A branded theme's body font replaced by the system font, or a system body font applied by a component instead of a theme token                                                                                                                                                                             |
| FR3      | Safari on iOS across Dynamic Type categories; Chrome on Android in the emulator with font scale; a desktop browser with a larger default font size and with zoom; theme review | a branded and an unbranded theme; no size set; default category; a size set on each platform; macOS Safari                                                                            | Text that ignores a size the person set; text that differs from the theme's family or size when none is set, other than the `family:input-fields` FR9 iOS text-entry floor; a theme family replaced; a public option, prop, or document attribute; a changed root font size                                |
| FR4      | Desktop browser at 200%, 250%, and 300% text size, plus Safari on iOS at accessibility categories                                                                              | reading text; a button, text input, tab, badge, table cell, and segmented control                                                                                                     | Lost content or function at 200% or less; a label clipped by its control's height at any size; a control that keeps a fixed height while its text grows                                                                                                                                                    |

## Decision log

### DEC-1 — Typography is the theme's; unbranded shipped themes may use the system body font

**Reference:** `spec:AST-102/DEC-1`
**Decider:** `cixzhang`, `2026-10-24`

A component that swaps in a platform font or its own text size breaks the
theme's typography for that one surface, and a product cannot see or tune it.
Keeping the family, size, and line height of component text in theme tokens
means the theme decides for that text. Where a shipped theme has no brand typeface, the system
body font is the most familiar choice for the person reading, so those themes
may use it through their own token; a brand keeps its typeface.

Rejected: components applying a platform font such as `-apple-system-body` directly.

### DEC-2 — A text size the person set wins in every theme

**Reference:** `spec:AST-102/DEC-2`
**Decider:** `cixzhang`, `2026-10-25`

A person who sets their text size expects to see it everywhere; a person who
has not expects the font the app chose. So every theme, branded included,
follows a size the person set, keeping its own family and scale relative to
that size, and gives its exact sizes when none is set. Large text stays usable
to 200% everywhere, and dense controls may stop at 200% without cutting text
off.

Rejected: only unbranded or opted-in themes following the person's size.

### DEC-3 — Following the person's size adds no public surface

**Reference:** `spec:AST-102/DEC-3`
**Decider:** `cixzhang`, `2026-10-25`

The person's size is honored by default, so products need no switch to turn it
on. Core reads it where the platform exposes it only through a system text
style, as on iOS, and lets the root font size carry it elsewhere; neither read
is a theme option, prop, or document attribute.

Rejected: a public opt-in option or document attribute for the size.

## Open questions

None.
