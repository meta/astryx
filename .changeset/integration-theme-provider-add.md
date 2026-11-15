---
'@astryxdesign/cli': patch
---

[feat] `astryx theme add`, on the first add, when an installed package names the provider that wires its themes, says so: "This app may already get its theme from <Provider> (from <module>, declared by <package>)." When the manifest's `themeProvider` names the provider's `themeProp`, it says to pass the added theme to it in the app root, and the wiring it shows is that provider with the generated module's theme (`<Provider theme={themes[defaultThemeSlug]}>`), in place of a Theme wrap; without one, "Replacing <Provider> applies this theme everywhere but also drops anything else it sets up; a Theme inside it themes only what it wraps." The add reads no app source. The JSON carries it as `appProvider`, each provider as `{export, from}` (with `themeProp`), and `themeProp` and `line` when a provider takes a theme object. An integration manifest's `themeProvider` takes an optional `themeProp` and, beside it, an optional `modeProp`: for a theme with one color mode, the wiring also passes `<modeProp>={themeModes[defaultThemeSlug]}`.

@josephfarina
