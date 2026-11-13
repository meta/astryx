---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: `new` and `show` end with `wiring`, the exact steps that put the theme into this app: the root file to edit (a Next app's root layout), the theme module and stylesheet imports from there, the `<Theme>` around the app, and what builds it; the editor's help says the same (`astryx theme add` takes theme packages only). A token set on a group names the members that read it and take the change, and what the others read instead; a part that never reads it is still refused.

@josephfarina
