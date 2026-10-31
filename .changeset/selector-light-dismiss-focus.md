---
'@astryxdesign/core': patch
---

[fix] Selector, MultiSelector: pressing another field while the list is open now leaves focus in that field. Before, the list's close handler moved focus back to the Selector's trigger, so the next key went to the closed Selector (a letter could change its value through type-to-select). Escape, picking an option, or a press on nothing focusable still return focus to the trigger, and a MultiSelector with `renderTrigger` still returns focus to the caller's control on every close.

@cixzhang
