---
'@astryxdesign/cli': patch
---

[fix] `swizzle` recursively copies nested core component source directories, preserving relative imports inside the copied tree and rewriting imports that escape it to the owner package. Components such as Table now include their plugins, while test-only `__tests__/` and `__snapshots__/` directories are skipped, so test harnesses that import unpublished internal packages are never copied; overwrite checks and the returned file list use the same complete set of relative paths (#3506).

Destination symlinks, including dangling file links, are rejected before any writes even with `--overwrite`. So is a destination already taken by the wrong kind of entry (a file where a directory must go, or a directory where a file must go): it reports `ERR_WRITE_FAILED` with the path relative to the project, instead of a raw `ENOTDIR`/`EISDIR` after earlier files were already replaced. Integration components retain the previous flat source-directory copy behavior, now in sorted order; recursive copying is limited to core component directories.

@jiunshinn
