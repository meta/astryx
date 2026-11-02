---
'@astryxdesign/richtext': patch
---

[fix] In `RichTextEditor`, Backspace at the very start of a code block turns it into a paragraph holding its lines, with the caret at its start. It used to merge the code into the block above, so a heading above took the code in, and the Markdown read back as a longer heading and a stray paragraph. A code block with nothing above it, which already became a paragraph, now keeps its lines when its Markdown is read back.
@emilyhorsman @ernestt
