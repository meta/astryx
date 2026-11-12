---
'@astryxdesign/cli': patch
---

[fix] A refusal longer than a pipe holds (64 KiB) reaches a slow reader whole, such as bash `$(…)` or a reader that takes its time: the `--json` envelope stays valid JSON with its code, and the text refusal keeps its last line. The CLI writes its final error output out before it exits. This is a small change to the shared error output, made for the theme editor's long refusals.

@josephfarina
