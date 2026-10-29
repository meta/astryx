---
'@astryxdesign/core': patch
---

[fix] The animated-layout module gains its internal in-place swap: old content held as one inert, transient copy while new content enters in its place, on the shared motion. Nothing uses it yet and nothing public changes. In right-to-left containers, content after a Collapsible or TreeList size change (with an `animatedLayout` handle) now glides by its inline-start edge instead of jumping.

@cixzhang
