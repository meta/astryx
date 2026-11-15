---
'@astryxdesign/cli': patch
---

[perf] The published CLI stores search's catalog at publish, and uses it in a project that adds nothing to a catalog while the CLI's and Core's files are unchanged, so a machine's first `search` answers about 350 ms sooner and its first `build` about 290 ms sooner. The catalog is gathered live, as before, in a project with an integration, a package that adds docs or blocks, or a local theme; with another Core version; and after a change to any file or folder the catalog reads. Output is the same.

@josephfarina
