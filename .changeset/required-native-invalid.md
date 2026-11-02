---
'@astryxdesign/core': patch
---

[fix] RadioList and Switch: a required field no longer reads as "invalid entry" to screen readers before the user has answered. Each required radio and a required switch take their invalid state from `status`.

@cixzhang
