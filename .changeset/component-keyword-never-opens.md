---
'@astryxdesign/cli': patch
---

[fix] `astryx component <name>` no longer opens a component through one of its keywords. A keyword is a word to find a component by, not another name for it. A name that is clearly one component's keyword now gives the usual not-found error, with that component as the first suggestion. Exact names, names in another case, and file names open as before. The component doc type and the single-component authoring guide now define keywords the same way, and the guide has a section on choosing them.

@josephfarina
