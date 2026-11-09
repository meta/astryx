---
'@astryxdesign/core': patch
---

[fix] In Chrome on Android, text follows the reader's system font scale in every theme with no setup. The root `Theme` reads `env(preferred-text-scale)` and scales every font size by it, as it already follows Dynamic Type on iPhone. Before, the system font scale reached Astryx text only when the page added `<meta name="text-scale" content="scale">`. A page with that meta keeps working as it did: its root font size carries the scale, and the root `Theme` adds none. Browsers without either see no change.

@cixzhang
