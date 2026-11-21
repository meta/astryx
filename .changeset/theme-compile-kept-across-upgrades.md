---
'@astryxdesign/cli': patch
---

[perf] The first `theme build` after a CLI upgrade reads back the JavaScript it compiled from a theme's local TypeScript or JSX modules, as long as the upgrade leaves the code that compiles them and Babel's installed files as they are, so it loads no Babel compiler. For a theme with an icon registry, that first build is about 0.15–0.3 s faster, and about 0.4 s when Node's compile cache is empty too. An invalid browserslist setting in the project no longer makes that compile fail. Every other answer is unchanged.

@josephfarina
