---
'@astryxdesign/cli': patch
---

[perf] The published CLI stores search's catalog at publish, and uses it in a project that adds nothing to a catalog while the CLI's and Core's files are unchanged, so a machine's first `search` answers about 350 ms sooner and its first `build` about 290 ms sooner. A project with an integration or a package that adds docs or blocks, another Core version, or a change to any file or folder the catalog reads gathers live, as before. Output is the same.

@josephfarina
