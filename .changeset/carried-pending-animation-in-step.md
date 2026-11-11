---
'@astryxdesign/core': patch
---

[fix] A transient copy that carries an animation still waiting for its first frame now runs it in step with the original. On a busy page, the SideNav rail's leaving copy could start the toggle's press fade a frame or more after the toggle's own.

@vjeux
