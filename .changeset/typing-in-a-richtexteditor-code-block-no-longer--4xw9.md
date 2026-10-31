---
'@astryxdesign/richtext': patch
---

[perf] Typing in a `RichTextEditor` code block no longer re-tokenizes the whole block. In TypeScript, JavaScript, Python, and shell code, an edit inside one line re-tokenizes that line, plus at most the line above it, and replaces only the color ranges inside the text node it edited, so a keystroke in a 2,000-line block tokenizes as little code as one in a short block. Edits that open or close a string or comment across lines, and other languages, still re-tokenize the whole block. Colors are unchanged, except that a block whose text nodes are replaced by others with the same text is now recolored instead of left uncolored.
@emilyhorsman @ernestt
