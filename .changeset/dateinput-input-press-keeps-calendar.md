---
'@astryxdesign/core': patch
---

[fix] A press in a DateInput's own text input or on its clear button no longer closes its open calendar. Clicking into the date text to fix a digit keeps the calendar showing; a press anywhere else on the page still closes it, and Escape still does.

@cixzhang
