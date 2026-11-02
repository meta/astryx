---
'@astryxdesign/core': patch
---

[fix] A disabled `Item`, `ListItem` or `TreeList` row with an `href` no longer navigates from a screen reader, Enter, or a link menu. Its link now has no `href`, `target` or `rel`, as a disabled `Link` does, and it keeps the link role.

@cixzhang @duytbp
