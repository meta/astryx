---
'@astryxdesign/core': minor
---

[breaking] A controlled `Tooltip` now reports every open and close request, so a tooltip wired to state (`isOpen={open} onOpenChange={setOpen}`) behaves like an uncontrolled one. Held open (`isOpen={true}`), a pointer or focus leave that would hide it calls `onOpenChange(false)` and hides nothing, the same call Escape makes. Held closed (`isOpen={false}`), a hover that would open it after `delay` calls `onOpenChange(true)` once and shows nothing. `useTooltip` reports the same requests through `onShow` and `onHide`.

Breaking: before, `isOpen={true}` suppressed hover and focus hiding without a report, and a held-closed hover reported nothing. An app that holds a tip open and agrees to every `onOpenChange` call now closes it when the pointer or focus leaves the trigger. An app that closes a tip on Escape and agrees to every call now reopens it on the next hover.

Migration: to keep a tip pinned through leaves, ignore `onOpenChange(false)` while it is pinned and close it from your own control. To keep a tip shut after Escape, ignore `onOpenChange(true)` until your app allows it again.

@cixzhang
