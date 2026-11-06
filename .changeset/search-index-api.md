---
'@astryxdesign/cli': patch
---

[experimental] `exportSearchIndex()` and `rankSearchIndex()` from `@astryxdesign/cli/api` store and rank search's candidates. `exportSearchIndex({cwd, package})` returns `{version, candidates}`: what `search()` ranks in a folder, as plain JSON (with `package`, only that package's entries). `rankSearchIndex(query, indexes, {type, limit})` ranks stored indexes with search's own tree: an index made in a project answers as `search(query)` does there, with the same response; for an index made outside a project, theme results name `theme add` where `search` there names `theme eject`. A catalog that lists packages it must not load makes the index where loading is safe and ranks it per query. An index is ranked only by the CLI version that made it. Both are experimental (they may change in a patch release), and their docs are not search results, so `search` and `build` answer exactly as before. When they are promoted to stable, their docs join search.

@josephfarina
