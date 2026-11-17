---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` reads `var()` in any letter case when it warns about a token that reads itself, tokens that read each other, or a `var()` no token sets, and it follows a loop through the token definitions Core sets on the theme's root (`--font-size-2xl: var(--text-heading-1-size)`). A misspelled pseudo-class (`:hovr`) is warned with the one it is near. The output is the same as before.

@josephfarina
