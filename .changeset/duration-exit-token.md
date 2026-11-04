---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] The theme token `--duration-exit`, the standard dismissal duration, now exists. It defaults to `var(--duration-fast)`, so it follows a theme's `tempo` through that token, and a theme can set it like any duration token. Before, a theme or component that read `var(--duration-exit)` found no value. The motion and token docs, and the theme template's token list, name it.

@cixzhang
