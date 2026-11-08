---
'@astryxdesign/core': patch
---

[fix] A controlled `Tooltip` held closed (`isOpen={false}`) now reports hover and focus intent as one `onOpenChange(true)` and shows nothing, so the caller decides, the same way Escape on a held-open tooltip reports `onOpenChange(false)` without hiding. A held-open tooltip now also reports a pointer or focus leave as `onOpenChange(false)` without hiding, so a tooltip wired to state (`isOpen={open} onOpenChange={setOpen}`) closes when the pointer leaves. Before, hover reported nothing, and focus opened the tooltip even though the caller held it closed.

@cixzhang
