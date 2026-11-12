---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a built type file (`<theme>.d.ts`, `.css.d.ts`, `.variants.d.ts`) replaced by a folder is named with `ls -la <file>`, never with an `--out` the editor does not have. A theme name one letter off an existing theme suggests the same command with that theme's name first (`set brnad corners small` → `set brand corners small`), and `new` with the typed name only after. An empty theme name (`''`, `-`, an unset variable) says the name is empty and names the themes here instead of `new my-theme`.

@josephfarina
