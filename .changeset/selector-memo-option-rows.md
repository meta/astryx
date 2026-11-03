---
'@astryxdesign/core': patch
---

[perf] Opening a Selector's list or moving its highlight re-renders only the options whose highlight or selection changes, not every option, so a long list opens sooner and arrow keys respond faster.

@cixzhang
