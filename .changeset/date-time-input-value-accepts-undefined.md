---
'@astryxdesign/core': patch
---

[fix] DateInput, TimeInput, DateTimeInput: `value` now accepts an explicit `undefined`. In a project with `exactOptionalPropertyTypes`, `value={state}` failed to compile when `state` held what `onChange` gave, because `onChange` sends `undefined` for a cleared field and an optional property no longer took one. A controlled field no longer needs a cast there. (#8961)

@HelloOjasMutreja
