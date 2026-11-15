---
'@astryxdesign/core': patch
---

[perf] A page whose components bring no tooltip code, such as one that renders only `Text` and `Heading`, loads about 9.6 KB less JavaScript before first paint (about 3.4 KB gzip). The truncation tooltip's tap handling no longer shares a file with the touch trigger code that its lazily loaded tooltip uses, so that code stays with the tooltip. Tapping a truncated text opens its tooltip as before.

@cixzhang
