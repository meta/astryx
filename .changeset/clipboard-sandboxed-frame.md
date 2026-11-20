---
'@astryxdesign/core': patch
---

[fix] Copy works inside a frame that does not allow the async Clipboard API, such as a sandboxed artifact viewer or an embed. There `useClipboard`, and so the copy buttons of `CodeBlock`, `Timestamp` and Markdown heading links, copy with the browser's copy command inside the reader's click or key press, also in an open modal dialog or a hover card, without moving focus. Before, those buttons copied nothing there (`CodeBlock` and `Timestamp` showed a failed copy), and the browser logged a permissions-policy violation for each press. Where the async Clipboard API is allowed, nothing changes.

@josephfarina
