---
'@astryxdesign/core': patch
---

[fix] A Selector in a field no longer makes a narrow page scroll sideways when its placeholder or value is long: the trigger takes the width its field gives it and ellipsizes the text, so the text no longer sets the field's minimum width. Ghost and secondary Selectors still size to their value.

@josephfarina
