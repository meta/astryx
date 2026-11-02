---
'@astryxdesign/core': patch
---

[fix] A press in a DateInput's own text input, on its clear button or on its label no longer closes its open calendar. Clicking into the date text to fix a digit keeps the calendar showing; a press anywhere else on the page, moving focus to another field, and Escape still close it.

@cixzhang
