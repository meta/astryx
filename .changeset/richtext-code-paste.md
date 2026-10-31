---
'@astryxdesign/richtext': patch
---

[fix] In `RichTextEditor`, pasting rich content into a code block inserts plain text: the plain text on the clipboard, or, when there is none, each pasted block as one line of its text. Headings, lists, tables, links, and formatting used to land inside the code block, where the Markdown export wrote them as plain lines of the fence, so the document read back differently from what the editor showed.
@emilyhorsman @ernestt
