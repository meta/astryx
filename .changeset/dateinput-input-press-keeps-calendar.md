---
'@astryxdesign/core': patch
---

[fix] A press in a DateInput's own text input, on its clear button or on its label no longer closes its open calendar. Clicking into the date text to fix a digit keeps the calendar showing; a press anywhere else on the page and Escape still close it, and moving focus from anywhere in the field (its text, clear button or calendar button) to another field now closes it too. (#9433)

@cixzhang
