---
'@astryxdesign/core': patch
'@astryxdesign/theme-gothic': patch
'@astryxdesign/theme-matcha': patch
---

[fix] Tooltip content is readable when it uses `Text` or other token-colored components, as the Tooltip docs show. The content now reads the tokens of the media side whose text reads best on the tooltip's inverted surface, as Toast's content does. Before, `<Text>` content took the page theme's primary text color, which is the color of the tooltip surface, so the tooltip looked empty in light and dark. Plain text, and bare text beside other elements, keeps the tooltip's own text color, so a theme's `tooltip` color still reaches it. In the Gothic and Matcha themes, secondary text on a light media surface is darker, so it reaches 4.5:1 on their tooltip and other light inverted surfaces.

@cixzhang
