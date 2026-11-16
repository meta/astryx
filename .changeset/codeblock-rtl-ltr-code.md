---
'@astryxdesign/core': patch
---

[fix] On right-to-left pages, CodeBlock and Code keep code in its own direction: punctuation stays where it was written, a long line starts at the visible edge and scrolls toward its end, each code line takes its direction from its first strong character, and inline code inside right-to-left text reads in source order. CodeBlock's line-number gutter, header and controls still follow the page. Left-to-right pages look the same.

@josephfarina
