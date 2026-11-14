---
'@astryxdesign/core': patch
---

[fix] CodeBlock's run-time highlight stylesheet now sits in the `astryx-base` cascade layer, like the rest of Core's CSS. A theme's syntax colours and an app's own `--color-syntax-*` or `::highlight()` rules now win over CodeBlock's defaults in any load order, also for a CodeBlock in a portal under a root Theme.

@duytbp
