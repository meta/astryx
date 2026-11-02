---
'@astryxdesign/core': patch
---

[fix] A press in a DateTimeInput's own time input no longer closes its open list of preset times. Clicking into the time text to fix a digit keeps the list showing; a press anywhere else on the page, moving focus away and Escape still close it.

@cixzhang
