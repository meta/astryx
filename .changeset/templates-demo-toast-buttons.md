---
'@astryxdesign/cli': patch
---

[fix] 78 template buttons that did nothing when pressed now say what would happen, as the other template demo actions do: the example toolbar buttons of the `documentation-design` page template, and the buttons with no handler in the Button, ButtonGroup, Center, IconButton, Layout, MediaTheme, Section, Stack, Theme, Toolbar and VisuallyHidden example blocks, show a "Demo: …" toast. A destructive one (delete, archive, or a destructive-variant demo) first asks for confirmation; Cancel does nothing.

@josephfarina
