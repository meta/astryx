---
'@astryxdesign/core': patch
---

[docs] Toast's doc marks the card's `isAutoHide` and `autoHideDuration` required, as `ToastProps` declares, and the show-only options (`uniqueID`, `collisionBehavior`, `onHide`) leave the card's props table, because `useToast`'s doc lists them with their defaults. The table still shows `type` as optional with its `'info'` default, which the theme editor reads; `ToastProps` requires it.

@cixzhang
