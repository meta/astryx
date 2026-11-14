---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme compile`: a compile or `--check` of an editor theme whose source no longer imports or extends its settings, or names another theme, is refused with the same message `set` gives, so it never writes another theme's files or drops every setting. The app copy's font stylesheet imports the installed `@fontsource` package of every family the built theme uses, the theme's own source included, and compile's note on fonts named but not loaded follows it. A theme build counts the families the theme's own font stylesheet beside its source loads (the app copy's), so a build of the copy's source no longer names them as unloaded. A blank or whitespace-only `--out` is refused.

@josephfarina
