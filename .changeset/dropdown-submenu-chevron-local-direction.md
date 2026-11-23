---
'@astryxdesign/core': patch
---

[fix] DropdownMenu: a flyout row's chevron and a drill-in Back chevron now follow the menu's own direction instead of the nearest `[dir="rtl"]` ancestor. In a local LTR menu inside an RTL document, the chevron used to point left while ArrowRight opened the flyout on the right. It now points right, so the icon, the opening key and the flyout side agree, as the bidirectionality guide's DR6 asks. A menu that is itself RTL is unchanged.

@wbaha
