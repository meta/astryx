---
'@astryxdesign/core': patch
---

[feat] LayoutContent names the container it sits in (`data-container="dialog"`, `"card"` or `"bottom-sheet"`), as LayoutHeader and LayoutFooter do, so a theme can style a dialog's body apart from its header and footer through `layout-content` with `container:dialog`, for a full-bleed title bar over a padded body and a footer bar. The Dialog's own LayoutContent takes it, an AlertDialog's body included.

@josephfarina
