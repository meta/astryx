---
'@astryxdesign/core': patch
---

[docs] FileInput's `statusVariant` docs say that dropzone mode does not support `attached`; use `detached` or `tooltip` there. Rendering is unchanged in this release. From the next minor release, a dropzone resolves `attached` to `detached` and defaults to it.
@cixzhang
