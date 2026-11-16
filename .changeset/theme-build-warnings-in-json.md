---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build --json` carries in its `warnings` the `--out` warnings the text run prints (a stylesheet name that is not .css, an output of another theme source it replaces, a folder the theme editor made), names a folder it cannot write with its fix instead of a temporary file's error, and names an `extends` written as a helper's call or a conditional as what it cannot follow instead of an inline icon registry. Its note on fonts named but not loaded also names the families of a component's `font` shorthand (`font: '600 14px Lora, serif'`).

[fix] `astryx theme build`'s full font help leaves out, family by family, each family the theme's own `<slug>.fonts.css` loads; before, it printed the whole list unless every family was loaded.

@josephfarina
