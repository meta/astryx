---
'@astryxdesign/core': patch
---

[fix] `TextInput`: activating the clear button now routes through the input's change handler with a real `ChangeEvent<HTMLInputElement>`, running `onChange` and then `changeAction` (unless `onChange` calls `preventDefault()`) in a transition with the optimistic value set to `''` while pending (`component:TextInput` FR3/FR5, `family:input-fields` FR6).

@SiyabongaDlamini
