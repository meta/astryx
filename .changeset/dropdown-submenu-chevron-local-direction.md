---
'@astryxdesign/core': patch
---

[fix] DropdownMenu: a flyout row's chevron and a drill-in Back chevron now flip by the nearest `dir` instead of any `[dir="rtl"]` ancestor. In an LTR menu inside an RTL page, the chevron used to point left while ArrowRight opened the flyout on the right. It now points right, so the icon, the opening key and the flyout side agree, as the bidirectionality guide's DR6 asks. An RTL menu inside its `dir` region is unchanged.

@wbaha
