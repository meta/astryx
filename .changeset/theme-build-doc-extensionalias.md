---
'@astryxdesign/cli': patch
---

[docs] `astryx docs cli/commands/theme-build` says the outputs are named for the theme and written beside its source unless `--out` names the CSS path, and that a theme named for its source file (`ocean.ts` holding the theme `ocean`) needs `--out` into another folder in an app whose bundler resolves a `.js` import to a `.ts` source first (webpack or Next.js `extensionAlias`), where `ocean.js` beside `ocean.ts` would load the source.

Reported by @ejc3.

@cixzhang
