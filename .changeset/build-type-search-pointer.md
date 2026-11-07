---
'@astryxdesign/cli': patch
---

[fix] `astryx build --type doc` and `--type theme` now point to `astryx search <query> --type doc` or `--type theme`: a build kit has no docs or themes, so build says so once on stderr and names the search that finds them. Stdout, JSON output and exit codes are unchanged.

@josephfarina
