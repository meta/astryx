---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns, at its line and with the same output as before, more values a browser drops: a part property that builds dash-first without a vendor prefix (`Color`), a token or part value that is no text (an object, a boolean, NaN, an array in a part), a [light, dark] pair with a missing half or another count, a token that reads itself, and a token's `var()` that no token sets. A pseudo-class after a pseudo-element that takes one (`::file-selector-button:hover`) is no longer warned, and only `:hover` and `:active` in capitals are. A warning about a value the theme takes from the theme it extends no longer gives a line of the file that extends it, and a `--family` build names it once, at the member that writes it. A tokens map spread from a defined theme's tokens no longer trips over Core's own private copies in it.

@josephfarina
