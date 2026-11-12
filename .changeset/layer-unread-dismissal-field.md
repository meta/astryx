---
'@astryxdesign/core': patch
---

[chore] Internal: Core's internal layer hook drops a dismissal-check field that no component reads. The layer still refuses to reopen during the press that closed it. Apps see no change.

@cixzhang
