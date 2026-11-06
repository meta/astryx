---
'@astryxdesign/cli': patch
---

[fix] The CLI no longer lists `@astryxdesign/theme-neutral`, `@astryxdesign/lab` or `@astryxdesign/charts` as optional peers. Before, a package manager could keep a theme from an older release as the CLI's peer after an app removed the theme and upgraded Core, and then warn that the theme's Core peer was not met. `@astryxdesign/core` stays the CLI's one optional peer. In a Yarn Plug'n'Play workspace member, or a pnpm workspace member with `hoist: false`, a legacy `package.json#astryx.theme` of `neutral` now makes `astryx component` warn that it cannot resolve the theme. Add the theme to the app with `astryx theme add neutral` instead.

@cixzhang
