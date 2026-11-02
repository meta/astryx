---
'@astryxdesign/core': patch
---

[fix] TextArea: a `startIcon` of `0` showed a stray "0" beside the start-icon slot, with no padding reserved for it. The slot and its padding now follow one presence check: empty values (`null`, `false`, `''`) render no slot, and `0` renders inside the slot like any other content. TextInput uses the same check, with no visible change.

@cixzhang
