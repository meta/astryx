---
'@astryxdesign/cli': patch
---

[fix] `astryx integration check` and `astryx integration verify` handle very large icon libraries (tens of thousands of exports). The check scans every file of the package for contribution metadata instead of stopping after 5,000 files with a warning that failed `--strict`. Verify reads npm's pack list from a file, so a package of any size no longer fails with `ENOBUFS`, and both commands keep a bounded number of parsed modules in memory, so they run in Node's default memory. An icon set that re-exports icons from its own package name (`export {X} from '<own package>'`) is now checked through the package's `exports`, as Node resolves it, instead of being listed as not checked.

@josephfarina
