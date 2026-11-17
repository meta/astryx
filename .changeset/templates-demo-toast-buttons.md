---
'@astryxdesign/cli': patch
---

[fix] 85 template buttons that did nothing when pressed now show a "Demo: …" toast that says what would happen, as the other template demo actions do. The calls to action of the `centered-hero`, `gallery-hero`, `product-gallery`, `side-gallery` and `documentation` page templates no longer link to `#`, the example toolbar buttons of the `documentation-design` page template gain demo toasts, and so do the buttons with no handler in the Button, ButtonGroup, Center, IconButton, Layout, MediaTheme, Section, Stack, Theme, Toolbar and VisuallyHidden example blocks.

@josephfarina
