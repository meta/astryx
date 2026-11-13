---
'@astryxdesign/cli': patch
---

[fix] From a project subfolder, `theme template` and `theme eject` print a build step that works from that folder (`cd ../.. && … theme build theme.template.ts` when the file is above it), and a blank template path is refused with `theme template` (no path) suggested, which writes at the project root; an absolute template path is told that paths are read from the current folder. `theme build --out` warns that it replaces another source's output only once every output may be written, reads a backslash in `--out` as a folder separator, and its `--check` "Rebuild with" line uses the project's invocation and quotes a path with a space. Building a theme the theme editor made with `theme build` still works, as released, and now warns (once per `--watch` session), naming `experimental theme editor show <theme>`. A theme file that is a link and fails on a relative import is named with the file it points to, with a build of that file that keeps its outputs in the working folder; no load error shows Node's require stack.

@josephfarina
