---
'@astryxdesign/core': patch
---

[fix] A Selector in a field no longer makes a narrow page scroll sideways when its placeholder is long. The placeholder still sets the field's preferred width, but no longer its minimum: when the field must be narrower, it ends in an ellipsis on one line, as before. A chosen value, and ghost and secondary Selectors, are unchanged. The trigger's text takes its own direction, so its ellipsis lands at its own end.

@josephfarina
