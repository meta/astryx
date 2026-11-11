---
'@astryxdesign/core': patch
---

[fix] A swizzled AppShell now leaves the keyboard to the package's scrolling regions inside it (ScrollableArea, Table, CodeBlock, Tokenizer, BottomSheet). Before, the copy kept its own record of registered scroll regions, which the package's regions never wrote to, so the copy yielded only to a region the browser reported as overflowing, not to every registered region as the package's AppShell does. No API changes.

@cixzhang
