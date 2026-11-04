---
'@astryxdesign/core': patch
---

[fix] DateInput and DateTimeInput keep typed text that has not reported a date, without an error, while disabled or busy, and commit it on the next Enter or blur once editable. A new value still replaces it. Typed text whose date `onChange` already reported gives way to the field's value once the field is editable again, so a failed save no longer leaves that text in the field, and typing the same date again reports it again.

@nynexman4464
