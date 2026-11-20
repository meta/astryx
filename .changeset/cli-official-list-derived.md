---
'@astryxdesign/cli': patch
---

[internal] The official package list `astryx discover` reads is derived from the repository when the CLI is packed, and is no longer committed. A checkout derives the same list, so adding a Lab component needs no edit outside Lab. `discover` lists the same packages.

@cixzhang
