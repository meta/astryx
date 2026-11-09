---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] On Android, text follows the reader's system font scale in every theme with no setup, in browsers that report `env(preferred-text-scale)` (verified on Chromium; Chrome stable not yet verified). The root `Theme` reads `env(preferred-text-scale)` and scales every font size by it, as it already follows Dynamic Type on iPhone. Before, the system font scale reached Astryx text only when the page added `<meta name="text-scale" content="scale">`. A page with `content="scale"` keeps working as it did: its root font size carries the scale, and the root `Theme` adds none. Browsers without either see no change. `astryx docs typography/type-scale` describes it.

@cixzhang
