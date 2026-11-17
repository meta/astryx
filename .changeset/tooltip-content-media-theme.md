---
'@astryxdesign/core': patch
---

[fix] Tooltip content is readable when it uses `Text` or other token-colored components, as the Tooltip docs show. The content now renders inside a `MediaTheme` on the side whose text reads best on the tooltip's inverted surface, as Toast's content does. Before, `<Text>` content took the page theme's primary text color, which is the color of the tooltip surface, so the tooltip looked empty in light and dark. Plain-text tooltips now use that side's primary text color, which can differ slightly from the page surface color they used before.

@cixzhang
