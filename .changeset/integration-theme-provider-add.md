---
'@astryxdesign/cli': patch
---

[feat] `astryx theme add`, on the first add, when an installed package names the provider that wires its themes, says so: "This app may already get its theme from <Provider> (from <module>, declared by <package>)." When the manifest's `themeProvider` names the provider's `themeProp`, it adds the one change that passes the added theme to it ("Pass this theme to it: <Provider theme={themes[defaultThemeSlug]}>."); without one, "Replacing <Provider> applies this theme everywhere but also drops anything else it sets up; a Theme inside it themes only what it wraps." The add reads no app source. The JSON carries it as `appProvider`, each provider as `{export, from}` (with `themeProp`), and `themeProp` and `line` when a provider takes a theme object. An integration manifest's `themeProvider` takes an optional `themeProp`.

@josephfarina
