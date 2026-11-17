---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` names a misspelled field at the line that writes it when the theme object is a member of a const (`all.a`), an element of an array, a branch of a ternary, an object `Object.assign` merges, or a `defineTheme()` argument written any of those ways. `astryx doctor` names each cause when a theme package's built module both imports TypeScript source and has a stylesheet that names a file the package does not ship.

Plain themes whose bases extend each other in a cycle are refused naming the cycle, instead of a stack overflow or a silent merge. `astryx experimental theme` removes a render folder a killed command left as soon as its maker is known gone (same machine, no such process), not only once it is ten minutes old.

@josephfarina
