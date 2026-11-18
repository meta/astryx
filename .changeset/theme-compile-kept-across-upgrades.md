---
'@astryxdesign/cli': patch
---

[perf] The first `theme build` after a CLI upgrade reads back the JavaScript it compiled from a theme's local TypeScript or JSX modules, as long as the upgrade leaves the code that compiles them and Babel's installed files as they are, so it loads no Babel. For a theme with an icon registry, that first build is about 0.3–0.4 s faster. Every answer is unchanged.

@josephfarina
