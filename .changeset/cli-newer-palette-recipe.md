---
'@astryxdesign/cli': patch
---

[fix] `astryx theme palette generate` refuses a palette config made with a newer Astryx CLI, whose recipe this CLI does not know yet, with the recipe it uses, the recipes this CLI knows, and the update step that fits where the CLI runs. The refusal keeps its error code.

@josephfarina
