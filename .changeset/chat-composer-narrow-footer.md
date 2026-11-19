---
'@astryxdesign/core': patch
---

[fix] ChatComposer keeps its send action inside the composer on a narrow screen. When the footer actions are wider than the footer, they wrap onto more lines inside the composer instead of pushing the send button past its edge; an action too wide for a line of its own is shortened with an ellipsis. Wide composers look the same as before.

@josephfarina
