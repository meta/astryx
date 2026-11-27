---
'@astryxdesign/core': patch
---

[fix] ClickableCard: `aria-expanded` and `aria-pressed` given to the card now apply to its hidden link or button, the element that a screen reader focuses and announces. Before, they stayed on the card's root, which has no role, so a screen reader did not announce whether a disclosure card was open or a toggle card was on (WCAG 2.2 SC 4.1.2, Name, Role, Value). `id`, `aria-labelledby`, and every other prop stay on the root.

@cixzhang
