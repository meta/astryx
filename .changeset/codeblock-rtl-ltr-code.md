---
'@astryxdesign/core': patch
---

[fix] On right-to-left pages, CodeBlock and Code keep code in its own direction: punctuation stays where it was written, a long line starts at the visible edge and scrolls toward its end, and inline code inside right-to-left text reads in source order. Each code line takes its direction from its first letter, on any page, so a line that starts with an Arabic or Hebrew letter reads right to left from the line's end; other code looks the same on left-to-right pages. CodeBlock's line-number gutter, header and controls still follow the page.

@josephfarina
