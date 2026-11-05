---
'@astryxdesign/cli': patch
---

[fix] `astryx docs <namespace> <section>` loads the project once instead of once for every guide below the namespace, so on a namespace with many guides, such as `astryx docs authoring <section>`, the read itself takes tens of milliseconds instead of hundreds. The answer is unchanged.

@vjeux
