---
'@astryxdesign/core': patch
---

[feat] PowerSearch suggests per-field values for free text via valueMatchBehavior. With `'all-string-fields'`, string operators whose values come from a `searchSource` get no free-text row unless arbitrary strings are allowed, so a suggestion this option adds always commits a value the field's editor offers.

@nbozidarevic
