---
'@astryxdesign/core': patch
---

[fix] Text inside a `Theme` that sets no line height of its own now uses the theme's body leading (`--text-body-leading`), as Core's own body text does, instead of the reset's 1.5. Plain text in a Card or Stack, a Blockquote's quote and table cells follow the theme's line height and move when a theme changes it; with the default theme, 14px text sits on 20px lines instead of 21px. Text outside a Theme is unchanged. To keep the old lines inside a Theme, set a line-height on your own container inside it, or set `--text-body-leading` in your theme (which also sets Core's own body text).

@josephfarina
