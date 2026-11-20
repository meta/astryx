---
'@astryxdesign/core': patch
---

[fix] `AvatarGroupOverflow` takes a caller's `aria-label` as its name. Before, the translated "{count} more" always replaced it, so a builder could not give the indicator a fuller name such as "Show 5 more teammates". A caller `aria-labelledby` still names it, and with neither the translated count does.

@cixzhang
