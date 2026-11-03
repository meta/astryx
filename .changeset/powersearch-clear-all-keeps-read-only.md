---
'@astryxdesign/core': patch
---

[fix] `PowerSearch`: Clear all keeps read-only filters. It removes only the filters the user can edit, the clear button shows only while an editable filter exists, Backspace on an empty input no longer removes a read-only filter, and Clear all announces "Editable filters removed" while a read-only filter remains. For callers, Clear all now calls `onChange` with the read-only filters and `remove` at the first removed index (`0` when no filter is read-only) instead of `[]` at the last filter's index.

@imdreamrunner
