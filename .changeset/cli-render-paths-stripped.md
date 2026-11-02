---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` resolves `compilerOptions.paths` the way TypeScript does: an exact key matches only itself, a `*` may sit anywhere in a key or target, and targets are tried in order, so monorepo mappings such as `"@scope/lib": ["../lib/src/index.ts"]` with a subpath key work. Only bare specifiers are matched, and an import whose targets do not exist resolves as a package, as in TypeScript. `--reverse` of a rendered file that lost its embedded source on the way (and has no Astryx components to rebuild from) now fails with `ERR_RENDER_SOURCE_DAMAGED`, saying so, instead of `ERR_RENDER_NOT_ASTRYX`.

@josephfarina
