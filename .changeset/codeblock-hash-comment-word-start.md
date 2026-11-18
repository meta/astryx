---
'@astryxdesign/core': patch
---

[fix] `CodeBlock` highlights a bash or YAML comment only from a `#` that starts a word. A `#` inside a word, such as the fragment in `https://example.com/#top`, no longer paints the rest of the line as a comment.

@Guihakka2
