---
'@astryxdesign/richtext': patch
---

[fix] In `RichTextEditor` and `RichTextView`, a code block that names no language now leaves room for its corner Copy button. A long line wraps before the button instead of running under it. The block is as tall as the same fence in `Markdown`, so switching between reading and editing no longer moves the content below it.

@cixzhang
