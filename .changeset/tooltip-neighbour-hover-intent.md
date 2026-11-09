---
'@astryxdesign/core': patch
---

[fix] Tooltip keeps hover intent warm while moving between triggers in the same document. The first hint keeps its configured delay; a neighbouring hint opens immediately and closes the previous one during the hover bridge. Leaving beyond the bridge restores the delay. Keyboard, touch, pinned and controlled tooltips keep their existing behavior.

@SemihSan
