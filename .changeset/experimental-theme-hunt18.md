---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: an invalid theme name suggests a name `new` takes (`my-neutral` for a built-in theme's name, a free numbered name for a taken folder), and says "a theme here already" only for the same name in another case. `new` on an existing theme suggests `set <theme> base <the --like given>` and a free name with the same options. A setting listed twice by hand names both values, and setting it to one value or undoing it fixes the list, without stepping back another change. With the built module missing, `set` and `undo` say the token changes are not listed, and never that the change shows nothing.

@josephfarina
