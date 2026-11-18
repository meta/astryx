---
'@astryxdesign/core': patch
---

[fix] Text inside a `Theme` that sets no size of its own now uses the theme's body size, 14px by default instead of the browser's 16px. Plain text in a Card or Stack, a Blockquote's quote and `Text type="inherit"` follow the theme's `--text-body-size`, as Core's own body text does, and move when a theme changes its text size. Text outside a Theme, and a host app's own styles, are unchanged: `reset.css` sets no font size. To keep 16px inside a Theme, set a font-size on your own container inside it, or set `--text-body-size` in your theme (which also sizes Core's own body text).

@josephfarina
