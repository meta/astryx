---
'@astryxdesign/core': patch
---

[fix] Pressing Enter in the typable date field of a `DateInput` or `DateTimeInput` (the pointer surface) now submits the surrounding form when nothing is typed, as in any text field. Typed text is still committed first, and that Enter does not submit. A disabled or busy field still does nothing on Enter.

@duytbp
