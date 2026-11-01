---
'@astryxdesign/core': patch
---

[fix] FileInput: a caller's `aria-describedby` and other `aria-*` props now reach the trigger button, the field's focusable control. Before they were set only on the hidden native input, which is `aria-hidden` and never focused, so `aria-describedby="hint"` was never read ("Report" announced without "PDF only, up to 10 MB"). The caller's ids are now joined to the trigger's own description ids, first. The props the trigger composes itself (`aria-label`, `aria-labelledby`, `aria-invalid`, `aria-busy`, `aria-disabled`, `aria-hidden`) are not copied. See `family:input-fields` FR10.1. No API changes.

@HelloOjasMutreja
