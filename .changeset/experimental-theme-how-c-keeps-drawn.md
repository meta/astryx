---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` checks a kept look against what it drew before, wherever Core wrote it (beside the variant and size), and compares a color token by name. A status except on inputs ("make inputs blue but keep the error border", "remove the border from inputs except error inputs") now answers on every base instead of being refused. An input that has no error look of its own takes no pin. In an except or a keep, "invalid" is the error status.

@josephfarina
