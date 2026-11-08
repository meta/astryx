---
'@astryxdesign/core': patch
---

[fix] `LayoutFooter`: a `data-divider` attribute passed by the caller no longer replaces the divider state the footer reflects, so the content above a footer without a divider keeps its collapsed spacing, and a footer with a divider keeps its spacing above the line. The docs now list `padding` and `ref`, and say that an unset `hasDivider` follows the Layout's `defaultHasDividers`.

@cixzhang
