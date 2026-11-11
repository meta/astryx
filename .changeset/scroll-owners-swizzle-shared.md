---
'@astryxdesign/core': patch
---

[fix] In a swizzled AppShell, the first Tab into the main region now stops on the region, as in the package's AppShell, when its first link or button sits inside a package scroll region that does not overflow (ScrollableArea, Table, CodeBlock, Tokenizer, BottomSheet), and the reverse. Arrow and Page keys are unchanged. No API changes.

@cixzhang
