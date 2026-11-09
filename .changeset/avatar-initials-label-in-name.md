---
'@astryxdesign/core': patch
---

[fix] Avatar: initials are drawn as generated content with empty alternative text instead of text, so axe's Label in Name check (`label-content-name-mismatch`) no longer flags a link or button avatar that shows initials. The accessible name, the name tooltip and the initials' appearance are unchanged. Tests that find initials by text read the `data-initials` attribute instead.

@cixzhang
