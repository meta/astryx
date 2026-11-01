---
'@astryxdesign/core': patch
---

[perf] `useResizable` with `autoSaveId` (and `SideNav` with `resizable={{autoSaveId}}`) now saves a dragged size to `localStorage` once, when the drag ends, instead of on every pointer move. Every write reached each other open tab of the site as a `storage` event, so one drag sent dozens of them. The storage key, the stored format and the size saved at the end are unchanged, and keyboard steps, `resize()`, `collapse()` and `expand()` still save at once.

@vjeux
