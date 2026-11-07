---
'@astryxdesign/cli': patch
---

[perf] A search, build or component read lists each folder once. A process that runs several reads, such as a docs site's search or an agent harness, reuses a folder's listing once the folder has stayed unchanged for two seconds. A later read lists the folder again after an entry is added, removed or renamed.

@vjeux
