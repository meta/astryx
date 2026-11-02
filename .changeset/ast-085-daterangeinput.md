---
'@astryxdesign/core': patch
---

[fix] DateRangeInput ignores calendar and preset commits after its open picker becomes disabled, without dismissing the picker or moving focus. Presets reflect the field's disabled state and reason. Enabled selection, clear behavior, and loading-only dismissal remain unchanged.
@korkt-kim
