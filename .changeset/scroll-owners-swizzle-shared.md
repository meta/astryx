---
'@astryxdesign/core': patch
---

[fix] A swizzled AppShell now leaves the keyboard to the package's scrolling regions inside it (ScrollableArea, Table, CodeBlock, Tokenizer, BottomSheet). Before, the copy kept its own record of registered scroll regions, which the package's regions never wrote to, so the copy's main region could take arrow and page keys meant for a region inside it that was not yet overflowing. No API changes.

@cixzhang
