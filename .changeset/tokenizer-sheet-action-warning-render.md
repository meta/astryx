---
'@astryxdesign/core': patch
---

[chore] Internal: the Tokenizer bottom sheet checks its result rows for `action` while it renders, not in an Effect after the commit. The development warning, its text and the rows are unchanged. Not exported from the package entry point. (#9808)

@cixzhang
