---
'@astryxdesign/core': patch
---

[fix] Touch press feedback now hears scrolls and page hides on the window's capture phase, where its pointer listeners already were. Under an app's window-capture `stopPropagation`, or a document-capture `stopImmediatePropagation` registered before Core, a finger's pressed look now ends when the content under it scrolls, and every pressed look ends when the page is hidden.

@vjeux
