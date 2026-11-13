---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: every build of a theme (new, set, undo, show, and `experimental theme compile` of its source) also writes its app copy, `src/themes/<theme>/`: a standard local theme (descriptor, a source that re-exports the built module, the built module, its stylesheet and font stylesheet), marked as written by the editor and never edited by hand. `astryx theme add <theme>` then puts the theme into the app, and `theme use`, `remove` and `list` take it as any local theme; `new` and `show` say so in `wiring`. A folder there that is not the editor's own copy is never written, and the wiring gives the imports by hand instead.

@josephfarina
