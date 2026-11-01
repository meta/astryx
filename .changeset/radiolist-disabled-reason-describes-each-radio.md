---
'@astryxdesign/core': patch
---

[fix] RadioList: a group disabled with a `disabledMessage` gives that reason to each radio as its description (`aria-describedby`), as well as to the radio group, so a screen reader announces it on the focused radio. A radio's own description comes first.

@vjeux
