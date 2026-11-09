---
'@astryxdesign/core': patch
---

[fix] `LayoutPanel`: on an edge that takes the Layout's own inset, the panel now tells its children the padding it applies there. Children that read their container's padding, such as a full-bleed `Divider`, `Table`, or `TabList`, or a nested `Layout`, now follow the panel's outer edge whenever the Layout's `padding` differs from the inner inset. Before, they used the inner inset: with `padding={6}` a full-bleed `Divider` stopped 8px short of the edge, and with `padding={0}` it ran 16px past it. The docs now say which edge `hasDivider` draws on, that the Layout's `defaultHasDividers` does not apply, and that `padding={0}` is full bleed, and they list `ref`.

@cixzhang
