---
'@astryxdesign/core': patch
---

[fix] `useImageMode` samples the image once for a `region` written inline. The effect depended on the region object's identity, so the documented call shape (a fresh object literal each render) re-fetched and re-decoded the image on every render, and each result re-rendered, without end. The effect now depends on the region's four numbers.

@thecodebasedot
