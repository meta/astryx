---
'@astryxdesign/cli': patch
---

[feat] `astryx theme build --family`: the family's root may extend a theme the family does not select, such as an installed theme package. Its CSS and export carry that base as the root's standalone build does, and the module imports the package for the icons it inherits. That package is a requirement: the family's receipt names it (`base`) and its text output says which package it requires, and a build fails naming the package and the theme when it is not installed or does not export the base, never building the root without it. A member whose own base is not selected is refused naming that base, and a local base the family does not select that supplies icons is refused naming the base to select.

@josephfarina
