---
'@astryxdesign/core': patch
---

[fix] `TextInput`: clicking the clear button now runs `changeAction` in a transition and sets the optimistic value to `''` while pending, matching the `family:input-fields` FR6 pipeline.

@SiyabongaDlamini
