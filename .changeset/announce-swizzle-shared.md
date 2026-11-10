---
'@astryxdesign/core': patch
---

[fix] A swizzled component and the package's components now announce through one pair of live regions: messages from both join the same frame, and a copy no longer mounts a second pair that screen readers would read twice or skip. The modal announcement route is shared the same way. No API changes.

@cixzhang
