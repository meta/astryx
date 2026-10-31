---
'@astryxdesign/core': patch
---

[perf] Pages that mount many truncated `Text` and `Heading` elements at once mount faster. Each one used to measure whether its text overflows while React was still committing the page, so every measurement forced its own style and layout pass; they now measure right after the commit, all of them together, so the page reads layout once. The ellipsis, the line clamp and the full-text tooltip are unchanged.

@cixzhang
