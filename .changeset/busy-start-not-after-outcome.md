---
'@astryxdesign/core': patch
---

[fix] BaseTypeahead and CommandPalette: when a typed search finishes before its "Loading" announcement is made, the pending "Loading" is dropped, so a screen reader no longer hears "Loading" after the result count or has it replace the count. This meets the busy-announcement requirement in spec:AST-086 (FR8).

@cixzhang
