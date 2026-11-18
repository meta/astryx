---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme compile`: `--check` of an editor theme also checks its app copy in `src/themes/<theme>/` and fails with `ERR_THEME_STALE`, saying why, when the copy is kept back, missing a file, gone, or not the current build. Each theme's copy follows its own build, so a later theme failing no longer leaves an earlier one's copy behind. The copy's files are not theme sources: compiling its descriptor, a copy build file or `src/astryx-themes.ts` names the theme to compile, the copy's source from a subfolder names the app root, and an `--out` into the copy folder is refused. A copy left with only its build outputs is still the editor's, a copy file that is gone is written back by the next `set`, and a folder the copy could not be made in is named. The compile help says it writes and checks the app copy.

@josephfarina
