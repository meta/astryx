---
'@astryxdesign/cli': patch
---

[perf] In a project where an integration can load, `theme build` keeps what it checks a theme against in Core's component docs between runs, while every doc and folder they were worked out from is unchanged. Building a theme again without changing it finishes about 115 to 130 ms sooner. The first build after an edit to the theme works the facts out again and keeps them, so it finishes no sooner than before and can take a few tens of milliseconds longer. A Core-only project keeps nothing and works out only what a build needs, as before. `doctor`'s row for the per-user cache names the new entry; output does not change otherwise.

@josephfarina
