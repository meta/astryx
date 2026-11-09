---
'@astryxdesign/core': patch
---

[fix] `LayoutPanel`: on an edge that takes the Layout's own inset, the panel now tells its children the padding it applies. A full-bleed child, such as `<Divider isFullBleed />`, now reaches the panel's outer edge when the Layout's `padding` differs from the inner inset; before, it stopped short by the difference. The docs now say which edge `hasDivider` draws on, that the Layout's `defaultHasDividers` does not apply, and that `padding={0}` is full bleed, and they list `ref`.

@cixzhang
