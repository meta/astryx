---
'@astryxdesign/core': patch
---

[fix] ChatComposer keeps its send action inside the composer on a narrow screen. When the footer actions are wider than the footer, they wrap onto another line instead of pushing the send button past the composer's edge, and no label is cut. Wide composers look the same as before.

@josephfarina
