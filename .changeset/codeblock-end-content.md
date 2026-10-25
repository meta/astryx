---
'@astryxdesign/core': patch
---

[feat] `CodeBlock` takes `endContent`, a slot for your own controls, such as a "Run in terminal" button. They appear just before Copy: in the header when the block has one, otherwise beside the code in the top inline-end corner, never over it. The slot never creates a header, and clicking or pressing keys in it never collapses the block. For single-line mode, leave out the title and pass `hasLanguageLabel={false}`: a one-line command then reads as one row with its controls beside it.

@cixzhang
