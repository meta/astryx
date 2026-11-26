---
'@astryxdesign/cli': patch
---

[fix] When a docs path finds nothing and its last part names a Core component or a Core hook by its full name, as typed or as a plural (`s` or `es`), the error suggests that command: a miss on `widgets/Buttons` suggests `astryx component Button`. A stable doc or topic with that name still wins, so a miss on `guides/icons` suggests docs.

@josephfarina
