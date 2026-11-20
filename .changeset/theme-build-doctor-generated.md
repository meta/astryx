---
'@astryxdesign/cli': patch
---

[fix] `theme build` of a missing file in a folder whose files another command generates (their first comment says which command writes them) says the file is generated and names that command, instead of offering a blank theme template. `doctor` still compares such a local theme's outputs with its source, and its fix for a stale or missing one runs the exact command that writes it, never a `theme build`. `doctor`'s fix when the themes folder cannot be read names the theme the message names (for a generated one, its command), never `<slug>`. A font stylesheet's local `@import` (a file beside it, `url(faces.css)`, or a package stylesheet such as `@fontsource/inter/index.css`, resolved from where the stylesheet really is) is followed and its fonts proven; a URL import is an external font service, and a local import doctor cannot follow, or one past the files it follows, is a warning, never a failure. The help and docs say `editor show <name> --png` takes pictures of real components.

@josephfarina
