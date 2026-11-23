---
'@astryxdesign/core': patch
---

[fix] The clear button in every input-family field takes a target of at least 24 by 24 CSS px under a mouse or pen (WCAG 2.2 SC 2.5.8). The 20 px button looks the same. The extra target goes up, down and toward the field's end, never toward the text, so a click at the end of the text still places the caret. Under a finger the target still grows through the shared touch band.

@cixzhang
