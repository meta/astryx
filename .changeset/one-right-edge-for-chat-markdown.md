---
'@astryxdesign/core': patch
---

[docs] ChatLayout's guidance explains how a reply gets one right edge: Markdown prose keeps its 680px measure while code blocks and tables span the message column, so pass `contentWidth="100%"` to the reply's Markdown. Markdown's default measure is unchanged. (#5598)

@ManoharPaturi
