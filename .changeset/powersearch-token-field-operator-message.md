---
'@astryxdesign/core': patch
---

[fix] `PowerSearch`: a filter token's field and operator now come from one catalog message (`@astryx.powersearch.token.fieldOperator`, "{field}: {operator}" in English), and its full text, which also names its remove button and editor, joins that label and the value with another (`@astryx.powersearch.token.labelValue`, "{label} {value}"). A locale can reorder the parts and change the punctuation. `PowerSearchToken` uses the same message. English tokens read as before, except that a filter with no operator text no longer shows a trailing colon.

@cixzhang
