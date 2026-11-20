---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: every value a refusal or a saved-settings repair offers now passes one gate, and each offered line is checked as `set` checks it before it is shown. A value may come only from these sources:

- What was typed, under exact readings: quotes, labels and copy debris (a trailing `;`, `!important`, a comment) taken off; the same number written another way (full-width digits, a comma decimal, an exponent, rem or pt as px, a percent); CSS color names written as words (`dark red` is `darkred`).
- A documented table: Tailwind's radius classes (`rounded-lg` is 8px), a dial's own words, a weight word, a number read as a dial's nearest rung.
- The theme's own saved values, for a keep or unlock line.
- The setting's documented fallback or other-direction step.
- The correction of a typo of what was typed: one letter off for a word of five letters or fewer, two for a longer one.

Anything else, such as a stock color, a stock shadow or easing, a reset, a default token or a nearest guess, gives `how <thing>`. A scale step (`red-500`) is no bare color.

Also:

- `font 'Inter 600'` offers the family and the weight separately.
- A Google Fonts spec (`Inter:wght@400;600`) offers its family.
- Another property's label on a part property (`padding 'margin: 8px'`) offers that property.
- `--color-danger` offers the error token, and `--color-primary` or `--color-brand` the accent token.
- A CSS property typed for the whole theme leads with its dial or token (`border-radius 8px` → `corners 8px`), never a part that was not named.
- A pasted object's nested values are read, and each of its lines is checked.
- A bare fraction on a size token gets no px guessed.
- A very long input is near nothing.
- `--state 'hover,focus-visible'` gives one line per state.
- A saved light-dark pair for one mode is refused with the half for that mode.
- A CSS-wide keyword on a token offers the undo only when the theme sets the token.

@josephfarina
