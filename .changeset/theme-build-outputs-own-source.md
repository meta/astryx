---
'@astryxdesign/cli': patch
---

[fix] `theme build --out` warns, naming both sources, when it replaces the built output of another theme source that still exists; an output there is its own when its header names this source, or names a source that no longer exists. A build output's header names its source from the project root of the outputs, so a build from any folder writes the same outputs and `--check` agrees with it from every folder; the source a header names is matched exactly. Builds to the default paths beside the source are unchanged. An `--out` path that does not end in `.css` still builds, with a warning, and the import line the build prints names the file as written. Several themes that build the same outputs are refused before any of them writes. The next steps after `theme eject` and `theme template` quote their paths, and `theme template` on a file `--overwrite` would refuse names a free path instead (its receipt adds `overwritable` and `alternative`). A damaged generated theme module names how to rebuild it (delete it, then `theme add` each theme it held), a default that is not added names `theme use` with an added theme, and a folder where the module goes is refused in plain words. A `--family` member that is a plain object says so and names a build of it on its own.

@josephfarina
