---
'@astryxdesign/cli': patch
---

[feat] `astryx theme build` keeps a theme's `componentIcons` slot functions. The built module imports each slot function from the module the theme source imports it from, writes static slot values beside it as JSON, and reads back the same static `componentIcons` view, so component icon slots resolve the same for the built theme as for the runtime theme. This includes slots inherited from a built, package, or family base. A slot function defined in the theme file still fails the build: move it to its own module and import it. In `--family` output, a member supplies its own slot functions through a named import of its whole `componentIcons` map. The module keeps each slot import as the theme source spells it (`--icons-specifier` rewrites only the icon registry import), so with `--out` in another directory, a module must answer to that specifier from the output directory.

@imdreamrunner
