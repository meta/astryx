---
'@astryxdesign/cli': patch
---

[perf] `astryx theme build` of a theme with a local TypeScript or JSX module, such as an icon registry, finishes about 200 ms sooner when the module has not changed since the last build. The JavaScript it compiles from the module is kept beside the kept gathers and read back while the source, the compile options, the imports it rewrites and every file of the Babel that compiled it are unchanged, so such a build loads neither `@babel/core` nor its TypeScript and JSX plugins. A first build, and a build after an edit to the module, compile as before. The written files do not change.

@josephfarina
