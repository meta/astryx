---
'@astryxdesign/core': patch
---

[feat] PowerSearch suggests per-field values for free text via valueMatchMode. String operators that take their values from a search source no longer get a free-text row unless arbitrary strings are allowed, so choosing a suggestion always commits a value the field's editor offers.

@nbozidarevic
