---
'@astryxdesign/cli': patch
---

[fix] When `astryx docs <path>` finds nothing and the path's last part names a Core component or hook, singular or plural, the error suggests that command: `astryx docs widgets/Buttons` suggests `astryx component Button`. A doc or topic with that name still wins, so `astryx docs guides/icons` suggests docs.

@josephfarina
