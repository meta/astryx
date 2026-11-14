---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] MobileNav's prop docs now list `label`, `xstyle`, `className`, `style`, `ref`, and `data-testid`, and the `label` docs say what names the drawer when it is not set. MobileNav's Chinese and dense prop text now reaches the docs: it was written where the doc compiler does not read it for a doc with two components, so those docs showed the English text. The Chinese text no longer marks `isOpen` and `onOpenChange` as required; inside AppShell the drawer reads them from context.

@cixzhang
