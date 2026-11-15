---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview add <description>` adds a page only when build is sure of its start. When build starts from the app shell, or from a page its page pick gives less than a clear fit (`start.fit` under build's `CLEAR_FIT`), it refuses, says why, and offers the nearest pages this app can show by name (`--template <id>`), then the list of every page. A description that names a page by its id or display name, names an app the preview has pages for, or names a page build's ranking matches by its name or a keyword, still adds it.

@josephfarina
