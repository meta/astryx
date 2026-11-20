---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a line offered when the theme is left out keeps every option typed (`--on`, `--state`, `--mode`, `--only`, `--like`, `--section`), so following it changes what was asked, never the whole theme. `undo` reads the words after the thing as one value, typed unquoted as `set` takes it (`undo t padding 4px 8px --on card`). With the theme left out, `undo` reads the scope in every spelling it takes with the theme typed (`--state focusVisible`, `--on Card`, `--mode Dark`) and offers the undo on the theme that holds it. A token typed where the theme goes (`show --color-accent`) is never a theme to make. A settings file whose list is written `"Settings"` is a theme that exists to `new`, never made again; written beside `"settings"`, the two are read as one list, the editor's entry winning where both set one thing, and the change says so.

@josephfarina
