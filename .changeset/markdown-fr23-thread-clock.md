---
'@astryxdesign/core': patch
---

[chore] Markdown's FR23 performance bench times each sampling window on the calling thread's CPU clock instead of the whole process's, so CPU spent by V8's background threads or a worker no longer counts toward either side. Test-only; `Markdown`'s behavior does not change.

@vjeux
