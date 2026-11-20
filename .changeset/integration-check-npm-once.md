---
'@astryxdesign/cli': patch
---

[perf] `integration check` and `doctor integration validate` ask npm once what a package's own folder packs, instead of once for each check that asks, and the authoring checks inside `integration check` no longer run the shipped-import check, whose notes they never read. In a large package with a `files` field, `integration check` finishes in about 10 seconds instead of 27, and `doctor integration validate` in about 9 instead of 12.5. Output does not change.

@josephfarina
