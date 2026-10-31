---
'@astryxdesign/core': patch
---

[fix] DateInput, DateRangeInput and DateTimeInput no longer build their calendar while the popover is closed. Each closed field used to mount a full month grid at page load and keep it updated, so a form with many date fields paid that cost per field. The calendar now mounts when the popover opens and opens on the field's current value. Opening, focus and dismissal are unchanged.

@harjothkhara
