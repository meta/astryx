---
'@astryxdesign/core': patch
---

[fix] When a page mounts both the package's AppShell and a swizzled AppShell as outermost shells, only the first now keeps the fixed main-region id; the other takes a generated id, as two package shells already did. Before, each copy kept its own claim list, so both shells used `astryx-app-shell-main` and the page had a duplicate id. No API changes.

@cixzhang
