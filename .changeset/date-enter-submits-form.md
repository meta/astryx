---
'@astryxdesign/core': patch
---

[fix] Pressing Enter in a `DateInput` or in the date part of a `DateTimeInput` now submits the surrounding form when nothing is typed, as in any text field. Typed text is still committed first, and that Enter does not submit.

@duytbp
