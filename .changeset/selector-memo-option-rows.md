---
'@astryxdesign/core': patch
---

[perf] A Selector's options re-render only when their own state changes: opening the list or moving the highlight no longer re-renders every option, so a long list opens sooner and arrow keys respond faster.

@cixzhang
