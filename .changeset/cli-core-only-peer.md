---
'@astryxdesign/cli': patch
---

[fix] The CLI no longer lists `@astryxdesign/theme-neutral`, `@astryxdesign/lab` or `@astryxdesign/charts` as optional peers. It never imports them. Before, a package manager could keep a theme from an older release as the CLI's peer after an app removed the theme and upgraded Core, and then warn that the theme's Core peer was not met. `@astryxdesign/core` stays the CLI's one optional peer.

@cixzhang
