---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor` no longer warns that no theme is wired in an app that imports its themes itself. Without a generated theme module or a package.json `astryx.theme`, the `themes` check now passes when the source of the app imports a theme's built module or stylesheet (the imports `theme add` writes) or passes a theme to `Theme`, followed through local variables, `defineTheme({extends})` and relative re-exports to its package, and names the file. A theme passed to `Theme` that doctor cannot trace (a prop, a function result) is reported as not confirmed (info), not as missing.
@josephfarina
