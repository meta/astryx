---
'@astryxdesign/core': patch
---

[fix] Code in `CodeBlock` and `CodeEditor` inside a nested `Theme` whose theme sets Core color tokens now takes that theme's syntax colors, in its own color mode, instead of the page theme's. Before, a nested theme with its own accent still highlighted keywords in the page theme's accent. A `Theme` whose theme sets no Core color token, such as one that only styles components, keeps the syntax colors around it. A `SyntaxTheme` around or inside the `Theme` still applies, and so do the nested theme's own `syntax` colors. An outer theme's `syntax` colors, like an app's page-root values for `--color-syntax-*` tokens, no longer reach inside a `Theme` whose theme sets Core color tokens: set `syntax` on that theme or wrap it in a `SyntaxTheme`.

@cixzhang
