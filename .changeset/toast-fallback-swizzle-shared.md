---
'@astryxdesign/core': patch
---

[fix] Without a `LayerProvider`, toasts from a swizzled `useToast` and from the package now show in one fallback stack. Before, each copy mounted its own fallback container, so the page showed two toast stacks that overlapped. No API changes.

@cixzhang
