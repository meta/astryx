---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme compile`: the app copy guard reads paths as the build does, so an `--out` written with backslashes or through a link into an editor theme's copy is refused, and a copy file named with backslashes is answered with the theme to compile. A file of yours in the copy folder, without the editor's mark, compiles like any theme source. Refusals run from a subfolder suggest the compile from the app root. The note on fonts named but not loaded follows the font stylesheet this compile writes, and the copy's font file no longer says the system has a font no package loads. A check held up by a file of yours names it and never sends you to a command that does not move it.

@josephfarina
