---
'@astryxdesign/core': patch
---

[fix] Field: `FieldStatusPlacement`, the type of every field control's `statusVariant` (`'attached' | 'detached' | 'tooltip'`), is exported from `@astryxdesign/core` and `@astryxdesign/core/Field`, so a wrapper component can type a `statusVariant` prop it forwards.

@cixzhang
