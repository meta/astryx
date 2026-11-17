---
'@astryxdesign/cli': patch
---

[fix] `astryx build` starts a part from a page family's base template only when that template leads the ranking and the family is where the part goes. A part request headed by a word that also names a component, such as "a table filter chip", asks for that piece and starts from the app shell.

@josephfarina
