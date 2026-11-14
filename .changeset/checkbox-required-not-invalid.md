---
'@astryxdesign/core': patch
---

[fix] A required `CheckboxInput` is no longer announced as invalid before anyone touches it. Chromium reported an unchecked required checkbox as invalid from its first render, so a screen reader said "invalid" on every required checkbox of a fresh form. The invalid state now follows `status`, as on `Switch`, and native validation still blocks a form submitted with the box unchecked.

@duytbp
