---
'@astryxdesign/core': patch
---

[feature] Holding a NumberInput stepper with a mouse or a pen repeats the step: the first repeat comes after 0.5 s, and later ones come faster. The field shows each repeated value as its draft and calls `onChange` once, when the hold ends by release or pointer cancel. A click still steps and commits at once.

@vjeux
