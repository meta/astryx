---
'@astryxdesign/cli': patch
---

[docs] `astryx build --help` lists every value `--type` accepts (component, hook, doc, template, theme), matching the invalid-type error and what build actually runs, and says that `doc` and `theme` give an empty kit, since the kit has no doc or theme group. A test keeps the help text, the choices, the API doc and the error message on build and search naming the same set, and checks what each value returns.

@josephfarina
