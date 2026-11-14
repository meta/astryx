---
'@astryxdesign/cli': patch
---

[experimental] The preview API (`themeEditPreviewAdd`, `themeEditPreviewApp`, `themeEditPreviewRemove`) no longer leaves SIGINT and SIGTERM listeners in the caller's process after it returns, so a program that uses it can still be stopped with Ctrl-C or kill; the CLI keeps holding a stop that lands while it prints the result.

@josephfarina
