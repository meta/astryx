---
'@astryxdesign/core': patch
---

[chore] Internal: when Tab moves focus into a NumberInput with `formatValue`, the focus handler itself puts the editable text in the input and selects it, instead of a layout effect that waited for the next render. Behavior is unchanged: typing still replaces the whole number.

@HelloOjasMutreja
