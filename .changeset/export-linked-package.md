---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export` treats a package that `node_modules` links to a folder inside the project (`npm link`, a `file:` dependency, a workspace package) as a package: the file no longer carries its modules as page files, so `--reverse` gives the page back exactly instead of refusing it. The page looks and runs the same.

@josephfarina
