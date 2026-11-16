---
'@astryxdesign/core': patch
---

[fix] Copy works inside a frame that does not allow the async Clipboard API, such as a sandboxed artifact viewer or an embed. `useClipboard`, and so the copy buttons of `CodeBlock`, `Timestamp` and Markdown heading links, copy through a selection and the browser's copy command there, also inside an open modal dialog; before, those buttons copied nothing there (`CodeBlock` and `Timestamp` showed a failed copy), and the browser logged a permissions-policy violation for each press. Focus and the selection come back to where they were.

@josephfarina
