---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns, at its line and with the same output as before, custom properties that read each other (a token with a fallback reading itself, two tokens, a half of a [light, dark] pair, tokens and local tokens, a part's own custom property), a pseudo-element near a known one (as that one misspelled), a pseudo-element missing from the CLI's selector data (as possibly newer than the CLI), a pseudo-element inside `:is()`, `:where()`, `:not()` or `:has()`, a pseudo-class after `::highlight()`, `:window-inactive` after any highlight but `::selection`, a token name that does not start with exactly two dashes, and an empty token value. A pseudo-class after `::search-text` or `::scroll-marker-group` is no longer warned. A child theme's own build names the file and line of a value the theme it extends writes. A null value's warning says what it builds: a null property leaves the base theme's value, while a null token is kept by the browser as the token's value, so most properties that read it act as if they were not set (text keeps the surrounding color, a background goes transparent) and a font family reading it falls back to the browser's default font.

@josephfarina
