---
'@astryxdesign/core': patch
---

[fix] DateInput and DateTimeInput keep typed text that has not reported a date, without an error, while disabled or busy, and commit it on the next Enter or blur once editable. A new value still replaces it. Typed text whose date `onChange` already reported gives way to the field's value once the field is editable again, on the next Enter or blur if the field has focus. (#9842)

@nynexman4464
