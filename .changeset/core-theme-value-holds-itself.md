---
'@astryxdesign/core': patch
---

[fix] defineTheme: a theme's own token map that holds itself is named as the theme's `tokens`, not as one of the adaptation rules of the theme it extends; and an adaptation rule's value or condition that holds itself is refused by its path (`adaptations.rules[0].value.tokens.self …`) instead of overflowing the stack.

@josephfarina
