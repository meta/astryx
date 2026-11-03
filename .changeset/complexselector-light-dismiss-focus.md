---
'@astryxdesign/core': patch
---

[fix] Closing a `ComplexSelector` by clicking into another control now leaves focus in that control instead of pulling it back to the selector, as `Selector` and `MultiSelector` already do. Escape, a close from the content, or a click on nothing focusable still returns focus to the trigger. A caller-rendered trigger (`renderTrigger`) still gets focus back on every close.

@cixzhang
