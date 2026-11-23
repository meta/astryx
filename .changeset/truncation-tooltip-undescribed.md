---
'@astryxdesign/core': patch
---

[fix] A truncated `Text` or `Heading` is announced once. Its truncation tooltip shows the element's own full text, and it no longer adds that text again as a description (`aria-describedby`), so a screen reader no longer reads it twice once the tooltip has mounted. Other tooltips still describe their anchor.

@cixzhang
