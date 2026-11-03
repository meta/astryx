---
'@astryxdesign/core': patch
---

[fix] `PowerSearch`: in a read-only field (`isReadOnly`), Backspace on an empty input no longer removes the last filter. A read-only field now removes no filter, as its `isReadOnly` docs promise.

@imdreamrunner
