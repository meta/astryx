---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` resolves `compilerOptions.paths` the way TypeScript does. Newly, a `*` may sit anywhere in a key or a target (`"theme-*-x"`, `"./icons/icon-*"`), and a key's targets are tried in order, so a module, stylesheet, image or JSON file under a later target is found; `--reverse` puts a file back under the target it came from, including a target with text before its `*`. Only bare specifiers are matched, an import whose targets do not exist resolves as a package, and a catch-all `"*"` key never turns a missing package into a path error. `--reverse` of a rendered file that lost its embedded source on the way (and has no Astryx components to rebuild from) now fails with `ERR_RENDER_SOURCE_DAMAGED`, saying so, instead of `ERR_RENDER_NOT_ASTRYX`.

@josephfarina
