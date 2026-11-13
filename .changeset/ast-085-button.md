---
'@astryxdesign/core': patch
---

[fix] A focused link-mode Button keeps focus when it becomes disabled, including with a custom router that does not forward a DOM ref. Disabled Buttons block caller activation handlers as well as onClick and clickAction. Busy link-mode Buttons keep their link role and tab eligibility without exposing a navigable destination or invoking a custom router; re-enabling restores the current destination.

@korkt-kim
