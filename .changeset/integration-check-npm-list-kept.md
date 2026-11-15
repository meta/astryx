---
'@astryxdesign/cli': patch
---

[perf] `astryx integration check` and `astryx doctor integration validate` in a package's own folder keep npm's list of the files the package packs. They read it back while the package's folders list the same entries (names, types and where each link points), and package.json, the ignore files npm applies in the package and in each folder above it, any package.json above it, and the npmrc files npm reads are all unchanged. Which files npm packs never depends on what they hold, so a run after an edit inside a file, saved in place or by renaming a new copy over it, skips npm. That took seconds for a large package: each check there finished about 2.6 seconds sooner. A package that bundles dependencies, or has a link in its folders, is asked every time. Output does not change.

@josephfarina
