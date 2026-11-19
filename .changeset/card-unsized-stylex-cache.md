---
'@astryxdesign/core': patch
---

[perf] A `Card` without `width`, `height`, `maxWidth` or `minHeight` now hits StyleX's class-name cache on every render. Its class names and inline styles stay the same. (#12060)

@Vaibhav2824
