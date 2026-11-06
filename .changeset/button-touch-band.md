---
'@astryxdesign/core': patch
---

[fix] Under a finger, a `Button` or `IconButton` is easier to hit. Its touch target grows toward 44 px through an invisible band, as far as its neighbors leave room, and its box doesn't change. A disabled or busy button gets no band, and a button in a `ButtonGroup` uses the group's band. Input clear buttons now use the same band in place of their fixed 24 px overlay. Nothing changes under a mouse. `@astryxdesign/core/utils/touchHitArea.stylex` is now an export, so a swizzled Button, ListItem, CheckboxInput, RadioListItem, InfoTip or SegmentedControl item resolves the band's styles.

@cixzhang
