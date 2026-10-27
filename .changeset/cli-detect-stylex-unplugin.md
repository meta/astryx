---
'@astryxdesign/cli': patch
---

[fix] `detectStylingSystem` recognizes `@stylexjs/unplugin` as a StyleX compiler, so projects compiling StyleX through the standard Vite path are detected as `stylex` instead of falling through to the `css` guidance.

@nbozidarevic
