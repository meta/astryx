---
'@astryxdesign/core': patch
---

[chore] Internal: Core adds two internal hooks that keep a ref at the latest committed prop or callback for event and gesture callbacks, and an internal entry through which Lab reaches them. Nothing uses them yet, and apps import nothing new.

@cixzhang
