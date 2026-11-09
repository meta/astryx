---
'@astryxdesign/core': patch
---

[fix] A controlled `Tooltip` held closed (`isOpen={false}`) no longer opens on keyboard focus or a click into a text-field trigger. It reports that focus as `onOpenChange(true)` and shows nothing, so the caller decides, the same way Escape on a held-open tooltip reports `onOpenChange(false)` without hiding. Before, focus opened a held-closed tooltip anyway, and Escape could not close it. `useTooltip` reports the same focus through `onShow` under `isOpen={false}`.

@cixzhang
