---
'@astryxdesign/core': patch
---

[fix] A Selector in a field no longer makes a narrow page scroll sideways when its placeholder or value is long. The text still sets the field's preferred width, but no longer its minimum: when the field must be narrower, the text ends in an ellipsis on one line, as before. Ghost and secondary Selectors are unchanged.

@josephfarina
