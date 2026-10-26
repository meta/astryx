---
'@astryxdesign/cli': patch
---

[fix] `astryx upgrade` no longer scans through a symbolic link into installed dependencies or version-control metadata, such as a symlinked `node_modules` or a link into a package store. Those trees were already never written; skipping them stops a run from the project root spending minutes reading them. Other symbolically linked folders are still scanned so their required changes are reported.

@ejhammond
