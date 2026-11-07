---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor` no longer warns that no theme is wired in an app that imports its themes itself. Without a generated theme module or a package.json `astryx.theme`, the `themes` check now passes when the source of the app imports a theme's built module or stylesheet (the imports `theme add` writes) or passes a theme to `Theme`, followed through module-scope variables, `defineTheme({extends})`, re-exports and installed packages to its package, and names the file. Only a theme whose package is installed, or a local theme, counts. A theme passed to `Theme` that doctor cannot trace (a prop, a function result, a variable declared inside a component) is reported as not confirmed (info), not as missing.
@josephfarina
