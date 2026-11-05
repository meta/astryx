---
'@astryxdesign/core': patch
---

[fix] Tokenizer: in the sheet presentation, `endContent` renders at the field's inline end and `renderToken` renders the field's tokens, as in the inline field, so the same props work on a phone under the `'adaptive'` default. Their own controls act without opening the sheet: an end-content button runs its handler, and a custom token's remove control commits `onChange` at once and moves focus to the trigger. A tap on a token, the placeholder or the field's empty space still opens the sheet. Before, the sheet dropped both props with a development warning. `renderItem`, `hasClear` (the sheet has its own Clear all), `hasEntriesOnFocus`, `menuWidth`, `tokenOverflowBehavior` and `hasAutoFocus` still apply to the inline field only.

@imdreamrunner
