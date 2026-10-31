---
'@astryxdesign/core': patch
---

[fix] CheckboxList: a group disabled with a `disabledMessage` gives that reason to each checkbox as its description (`aria-describedby`), as well as to the group, so a screen reader announces it on the focused checkbox. A row's own description comes first.

@vjeux
