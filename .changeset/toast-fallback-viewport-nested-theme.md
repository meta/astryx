---
'@astryxdesign/core': patch
---

[fix] Toast: a `Theme` inside toast content shown by the fallback viewport (no `LayerProvider`) now themes only its own subtree. It no longer rewrites the page's `<html>` theme as if it were the app's root `Theme`. First fixed in #5617.

@cixzhang @AKnassa
