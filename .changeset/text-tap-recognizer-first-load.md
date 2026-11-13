---
'@astryxdesign/core': patch
---

[perf] A page that renders `Text` or `Heading` without a Button, Link or form field loads about 9.6 KB less JavaScript before first paint (about 3.5 KB gzip). The truncation tooltip's tap handling no longer shares a file with the touch trigger code that its lazily loaded tooltip uses, so that code stays with the tooltip. Tapping a truncated text opens its tooltip as before.

@cixzhang
