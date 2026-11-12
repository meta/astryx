---
'@astryxdesign/cli': patch
---

[fix] `theme build` refuses one of its own outputs (`.css`, `.d.ts`, `.js`) or a file of a kind no theme module has (a plain `.css` file) before loading it, and names the theme source to build instead of a loader error. A missing input that is a bare theme name (`theme build brand`) or a path with backslashes suggests the theme source that exists. `theme eject` from a subfolder forks into the project's `src/themes`, as `theme list` and `theme add` read it, and reads a relative path from the working folder. `theme targets .astryx-switch` reads the class as the output prints it. The `experimental theme` copies no longer reword text you typed that holds `astryx theme …`.

@josephfarina
