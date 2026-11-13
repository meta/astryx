---
'@astryxdesign/cli': patch
---

[perf] In a project with integrations, template discovery's records are kept beside search's catalogs and read back while every file and folder discovery read is unchanged, so `template --list`, `template <name>` and `build` skip discovering templates on later calls (about 0.1 s with a large integration), and a template added, renamed or edited in an integration shows on the next call. A record that would not read back exactly (a function, a Map, a shared object, -0 and the like) is never kept. `doctor`'s cache row names template discovery's records.

@josephfarina
