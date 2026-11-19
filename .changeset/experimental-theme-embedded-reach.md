---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set … --on <part>`: a CSS property set on a part names every part drawn as that part inside other components (a calendar's nav arrow, a code block's copy button and an input's clear button are buttons too), with the one line that keeps each as Core draws it (`embedded`), so a button look can stop there when wanted. A look set for a variant (`--when variant:ghost`) names them with no line: a rule on a part with no such variant never outranks it. A part that has its own setting of the same thing is not named.

@josephfarina
