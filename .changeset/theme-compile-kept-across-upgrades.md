---
'@astryxdesign/cli': patch
---

[perf] The first `theme build` after a CLI upgrade reads back the JavaScript it compiled from a theme's local TypeScript or JSX modules, as long as the upgrade leaves the code that compiles them and Babel's installed files as they are, so it loads no Babel. For a theme with an icon registry, that first build is about 0.15–0.3 s faster, and about 0.4 s when Node's compile cache is empty too. A project's browserslist setting no longer affects or breaks that compile: an invalid query used to make it fail. Every other answer is unchanged.

@josephfarina
