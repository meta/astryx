---
'@astryxdesign/cli': patch
---

[docs] `astryx build --help` lists every value `--type` accepts (component, hook, doc, template, theme), matching the invalid-type error and what build actually runs. A test now keeps the help text, the choices, the API doc and the error message on build and search naming the same set.

@josephfarina
