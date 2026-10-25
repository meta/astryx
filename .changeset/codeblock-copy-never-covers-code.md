---
'@astryxdesign/core': patch
---

[fix] A CodeBlock with no title or language label no longer lets its Copy button cover code. The button sits in its own column beside the code instead of over it, so a long first line ends before the button, whether the code is scrolled sideways, wrapped, or right-to-left. The button is centred on the first line, so a one-line block reads as one row with even space above and below, and a block that grows line by line keeps the button where it was. Blocks with a header are unchanged.

@cixzhang
