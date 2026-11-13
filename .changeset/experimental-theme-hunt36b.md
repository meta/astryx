---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the home folder is the app when its own package.json lists Core; a folder inside node_modules is never the app; a dependency field that is not an object reads as no Core instead of failing; install suggestions use the app's package manager; a Yarn Plug'n'Play app gets its own refusal from any of its folders; the workspace refusal names apps up to six folders deep and writes a folder starting with `-` as `./-name`; a package.json that does not parse is named with the parser's error and its place.

@josephfarina
