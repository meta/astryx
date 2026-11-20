---
'@astryxdesign/cli': patch
---

[fix] A shipped doc's stored parse is used only when the installed zod release is the one that made it. With another zod release, the CLI parses the doc, so the answer is always what a fresh parse gives.

@josephfarina
