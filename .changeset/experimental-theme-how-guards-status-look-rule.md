---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` now judges a kept look by what it draws. In "make the inputs bolder but keep the error inputs as they are", the error inputs had no weight rule of their own. Now `how` writes back the weight they inherit and answers, instead of refusing. A kept variant that draws no border in any of its looks ("remove the border from cards except the muted ones") is kept without writing a border back on it. A word between a part and what changes that names no part, state, variant, aspect, color or known modifier ("the card zorp border") now gets "no part or word called zorp", and nothing is written.

@josephfarina
