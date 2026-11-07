---
'@astryxdesign/cli': patch
---

[feat] `astryx docs --depth <levels>` now names the docs below each namespace on the topic list, by the route that opens them, so one read learns every route instead of one read per namespace. Without `--depth` the list is unchanged, and the JSON keeps its shape: the new `children` sit inside each `meta.namespaces` entry.

@josephfarina
