---
'@astryxdesign/cli': patch
---

[feat] `astryx theme add`, on the first add, when an installed package names the provider that wires its themes, says so: "This app may already get its theme from <Provider> (from <module>, declared by <package>). The outermost Theme sets the page's theme and mode, and an inner Theme covers only what it wraps." The add reads no app source. The JSON carries it as `appProvider`, each provider as `{export, from}`, as `theme list` names it.

@josephfarina
