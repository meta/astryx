---
'@astryxdesign/core': patch
---

[fix] A theme's padding written with `clamp()`, `calc()`, `min()`, `max()` or `var()` with a fallback now builds as written. The theme compiler splits `padding`, `paddingBlock` and `paddingInline` on the spaces between values only, never on a space inside parentheses or quotes, so `padding: clamp(8px, 2vw, 16px)` stays one value instead of becoming broken CSS. No API changes.

@josephfarina
