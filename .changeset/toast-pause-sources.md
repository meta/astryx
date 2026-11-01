---
'@astryxdesign/core': patch
---

[fix] Toast: a toast's auto-hide timer stays paused while any pause condition still holds. Before, the pointer leaving the card, focus leaving it, or the window regaining focus resumed the timer even if another condition was still active, so a toast could hide while focus was on its action or the pointer was over it. Focus moving between the toast's own controls also keeps it paused.

@cixzhang
