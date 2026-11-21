---
'@astryxdesign/core': patch
---

[fix] `Avatar`: initials are now 40% of the avatar's rendered box instead of 40% of the `size` prop, so a theme that resizes an avatar keeps them in proportion, and `xsm` initials are never smaller than 10px (they were 8px). Default sizes are unchanged except `xsm`, whose initials grow from 8px to 10px. A theme can still set an exact size per tier with an `avatar-fallback` rule.
@HelloOjasMutreja
