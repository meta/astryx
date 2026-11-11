---
'@astryxdesign/core': patch
---

[fix] Under right-to-left, a Field's label, description and status message, including a message shown in the status tooltip, keep the character order they were written in. Text with no right-to-left letter, such as `Prefix https://` or `+3`, used to show reordered (`//:Prefix https`, `3+`); it now lays out left to right in an inner `span`. Text that contains a right-to-left letter keeps the page's direction, so `example.com موقع` still reads right to left. The label's alignment, its optional or required marker, the status icon, and the accessible name and description text do not change. The inner `span` is added on left-to-right pages too, where nothing visible changes; a test that finds a label, description or status by its text now finds that `span`.

@cixzhang
