---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build --family`: the family's root may extend a theme the family does not select, such as an installed theme package. Its CSS and export carry that base as the root's standalone build does, and the module imports the package for the icons it inherits. A member whose own base is not selected is refused naming that base, and a local base the family does not select that supplies icons is refused naming the base to select.

@josephfarina
