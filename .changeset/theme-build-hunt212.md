---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns, at its line and with the same output as before, custom properties that read each other (a token with a fallback reading itself, two tokens, a half of a [light, dark] pair, tokens and local tokens, a part's own custom property), a pseudo-element no browser knows, a pseudo-element inside `:is()`, `:where()`, `:not()` or `:has()`, a pseudo-class after `::highlight()` other than `:window-inactive`, a token name that does not start with exactly two dashes, and an empty token value. A pseudo-class after `::search-text` or `::scroll-marker-group` is no longer warned. A child theme's own build names the file and line of a value the theme it extends writes. A null value's warning says that null leaves the value unset.

@josephfarina
