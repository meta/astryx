---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` resolves `compilerOptions.paths` the way TypeScript does: an exact key matches only itself, a `*` may sit anywhere in a key or target, and targets are tried in order, so monorepo mappings such as `"@scope/lib": ["../lib/src/index.ts"]` with a subpath key work. `--reverse` now says when a rendered file lost its embedded source on the way (and has no Astryx components to rebuild from), instead of calling it not an Astryx page.

@josephfarina
