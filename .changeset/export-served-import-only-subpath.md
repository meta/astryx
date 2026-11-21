---
'@astryxdesign/cli': patch
---

[experimental] Outside a project, `astryx experimental export` loads a subpath that a package from its package set exports only under the `import` condition, as a theme package's `./themes/<name>` often is. Such a page used to fail as if the package were not installed. A subpath the package does not export keeps the answer it had.

@josephfarina
