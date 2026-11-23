---
'@astryxdesign/core': patch
---

[fix] DropdownMenu: a flyout row's chevron and a drill-in Back chevron now flip by the nearest `dir` instead of any `[dir="rtl"]` ancestor. In an LTR menu inside an RTL page, the chevron used to point left while ArrowRight opened the flyout on the right. It now points right, so the icon, the opening key and the flyout side agree, as the bidirectionality guide's DR6 asks. This covers a menu that renders inside its `dir` region. A menu whose trigger sits in an element the layer treats as unsafe is portaled out with only its CSS direction, and is not covered. An RTL menu is unchanged.

@wbaha
