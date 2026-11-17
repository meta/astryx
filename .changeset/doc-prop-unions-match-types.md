---
'@astryxdesign/core': patch
---

[docs] Text's `as` docs list `h1`, `h2` and `h3`, and PowerSearch's `statusVariant` docs list `tooltip`, as their types already allow. A new test fails when a documented string union differs from its prop's type.

@josephfarina
