---
'@astryxdesign/cli': patch
---

[fix] `theme build --out` never replaces the built output of another theme source: an output there is its own only when its header names this source, or names a source that no longer exists. Builds to the default paths beside the source are unchanged. An `--out` file path ends in `.css`, so the module's stylesheet import always finds its file. Several themes that build the same outputs are refused before any of them writes. The next steps after `theme eject` and `theme template` quote their paths, and `theme template` on a file `--overwrite` would refuse names a free path instead. A damaged generated theme module names how to rebuild it (delete it, then `theme add` each theme it held), a default that is not added names `theme use` with an added theme, and a folder where the module goes is refused in plain words. A `--family` member that is a plain object says so and names a build of it on its own.

@josephfarina
