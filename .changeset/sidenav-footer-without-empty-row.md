---
'@astryxdesign/core': patch
---

[fix] `SideNav` no longer adds space below a `footer` when it has no `footerIcons` and no built-in collapse button. The sidebar rendered an empty footer row there, and the gap of the sticky bottom area added space after the footer. The row now renders only when it holds the collapse button or `footerIcons`, as the drawer already does.

@vittoriobusatta
