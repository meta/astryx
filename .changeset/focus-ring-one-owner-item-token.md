---
'@astryxdesign/core': patch
---

[fix] In an `Item` with its own `onClick` or `href`, and in a clickable or link `Token`, focusing another control inside (an action in `startContent` or `endContent`, or the token's remove button) no longer also rings the whole row or token: each tab stop shows one focus ring. The row or token rings only for its own action. Rows that hand their keyboard access to a nested control (`interactiveRef`, as CheckboxList and RadioList rows do) are unchanged.

@cixzhang
