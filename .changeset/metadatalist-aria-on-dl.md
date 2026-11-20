---
'@astryxdesign/core': patch
---

[fix] MetadataList passes a caller's `aria-label`, `aria-labelledby` and `aria-describedby` to the `dl`, so screen readers announce the list's name (#13089). Other props stay on the root `div`.

@ravindrasinghshah
