---
'@astryxdesign/cli': patch
---

[perf] In a project where an integration can load, `theme build` keeps what it checks a theme against in Core's component docs between runs, while every doc and folder they were worked out from is unchanged. It works them out before it reads the theme, so they do not depend on the theme: building a theme again, with or without an edit to it, finishes about 120 to 150 ms sooner. A Core-only project keeps nothing and works out only what a build needs, as before. `doctor`'s row for the per-user cache names the new entry; output does not change otherwise.

@josephfarina
