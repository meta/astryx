---
'@astryxdesign/core': patch
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-chocolate': patch
'@astryxdesign/theme-gothic': patch
'@astryxdesign/theme-matcha': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-stone': patch
---

[feat] Chat surfaces now default to the container radius: `--radius-chat` defaults to `var(--radius-container)` instead of `28px`, a theme that sets `--radius-container` but not `--radius-chat` declares the alias at its root, and a radius scale no longer sets `--radius-chat` (it set the page step), so chat follows the theme's container, also where the theme sets its container over the scale. This changes the corners of ChatComposer, its drawer and status bar, and ChatMessageBubble, and the buttons inside the composer take their normal corners. Butter, Chocolate, Gothic, Matcha, Neutral and Stone set `--radius-chat: 28px`, so they look the same; Y2K stays square. To keep the 28px chat corners in another theme, add `--radius-chat: 28px` to its tokens. Set the token in the theme rather than on an ancestor such as `:root`: a theme scope that declares it now replaces an inherited value.
@kentonquatman
