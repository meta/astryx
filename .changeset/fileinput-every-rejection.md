---
'@astryxdesign/core': patch
---

[fix] When several picked or dropped files break `accept` or `maxSize`, `FileInput` names every rejected file and why in its status message, not only the first (WCAG 2.2 SC 3.3.1). The messages are listed in the active locale. Going over `maxFiles` still reports the limit, "Maximum N files allowed".

@cixzhang @duytbp
