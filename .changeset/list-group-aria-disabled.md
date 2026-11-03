---
'@astryxdesign/core': patch
---

[fix] A disabled `CheckboxList` or `RadioList` now sets `aria-disabled="true"` on its group, so a screen reader announces the group itself as unavailable, not only each option, and the dimmed group label counts as the label of an inactive control.

@cixzhang @duytbp
