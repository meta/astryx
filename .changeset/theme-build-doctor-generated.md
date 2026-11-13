---
'@astryxdesign/cli': patch
---

[fix] `theme build` of a missing file in a folder whose files another command generates (their first comment says which command writes them) says the file is generated and names that command, instead of offering a blank theme template. `doctor` does not compare such a local theme's outputs (it says it did not, naming the command), and its fix for one is that command, never a `theme build` that cannot run. `doctor`'s fix when the themes folder cannot be read names the added theme rather than `<slug>`. A font stylesheet's local `@import` (a relative file, or a package stylesheet such as `@fontsource/inter/index.css`) is followed and its fonts proven; only a URL import counts as an external font service. The help and docs say `editor show <name> --png` takes pictures of real components.

@josephfarina
