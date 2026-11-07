---
'@astryxdesign/core': patch
---

[fix] A controlled `Tooltip` held closed (`isOpen={false}`) now reports hover and focus intent as one `onOpenChange(true)` and shows nothing, so the caller decides, the same way Escape on a held-open tooltip reports `onOpenChange(false)` without hiding. Before, hover reported nothing, and focus opened the tooltip even though the caller held it closed.

@cixzhang
