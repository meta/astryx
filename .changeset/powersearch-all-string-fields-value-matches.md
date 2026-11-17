---
'@astryxdesign/core': patch
---

[feat] PowerSearch suggests per-field values for free text via valueMatchBehavior. With `'all-string-fields'`, `string` operators with a `searchSource`, and `string_list` operators with one unless `isArbitraryStringAllowed` is set, get no free-text row, so a suggestion this option adds always commits a value the field's editor offers.

@nbozidarevic
