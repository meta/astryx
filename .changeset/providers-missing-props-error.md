---
'@astryxdesign/core': patch
---

[fix] In development, `Markdown`, `SyntaxTheme`, `InternationalizationProvider` throw an error that names a missing required prop and shows the fix, instead of a TypeError from inside the component. Production output is unchanged.

@josephfarina
