---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] MobileNav's prop docs now list `label`, `xstyle`, `className`, `style`, `ref`, and `data-testid`. The `label` docs say what names the drawer when it is not set. The Chinese docs no longer mark `isOpen` and `onOpenChange` as required; inside AppShell the drawer reads them from context.

@cixzhang
