---
'@astryxdesign/core': patch
---

[fix] ClickableCard: `aria-current` and `aria-describedby` given to the card now apply to its hidden link or button, the element that a screen reader focuses and announces. Before, they stayed on the card's root, which has no role, so a screen reader did not convey them for the focused card (WCAG 2.2 SC 4.1.2, Name, Role, Value). Every other prop, data attributes included, stays on the root.

@vjeux
