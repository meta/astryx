---
'@astryxdesign/core': patch
---

[fix] A focused link-mode Button keeps focus when it becomes disabled, including with a custom router that does not forward a DOM ref. Disabled Buttons block caller activation handlers as well as onClick and clickAction.

@korkt-kim
