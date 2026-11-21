---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: some states have another word for exactly one of the part's own states (`--state pressed` on a part whose press is `active`, `inactive` for `disabled`). These are now written as that state, and the result says so, instead of being refused. A word that could mean more than one state is refused as before, naming the part's states and suggesting one.

A state a part shows from the element it rides, such as a list item's `selected` (marked by its Item), is now written as the attribute Core marks, inside the part's rule. The build takes it without an "Unknown prop" warning, and a saved one builds the same with no rewrite of the file.

@josephfarina
