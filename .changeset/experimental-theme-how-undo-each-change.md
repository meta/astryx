---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: each "the … change" said after an undo ("Undo the heading change and the card corners change") is an undo of its own. It takes back that part's change said earlier in the ask, or says the theme sets nothing for it; it never asks for a change. Before, the second phrase was written as a new change, or the undo took nothing back. Changes of one part that clash are taken back with the choice between them, and "too" after the change adds nothing.

@josephfarina
