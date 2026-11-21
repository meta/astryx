---
'@astryxdesign/core': patch
---

[fix] A `toast.inset` edge set to `0` now puts toasts flush to that edge. Before, a zero edge counted as unset, so the toast viewport kept the provider's inset there.

@cixzhang
