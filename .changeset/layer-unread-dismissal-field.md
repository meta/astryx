---
'@astryxdesign/core': patch
---

[chore] Internal: Core's internal layer hook drops a dismissal-check field that no component reads, and Core drops an unused deprecated stray-click constant that no package entry exports. The layer still refuses to reopen during the press that closed it. Apps see no change.

@cixzhang
