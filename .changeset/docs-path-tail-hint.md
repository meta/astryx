---
'@astryxdesign/cli': patch
---

[fix] When a docs path finds nothing and its last part names a Core component or hook, as typed or with a plural read as singular, the error suggests that command: a miss on `widgets/Buttons` suggests `astryx component Button`. A doc or topic with that name still wins, so a miss on `guides/icons` suggests docs.

@josephfarina
