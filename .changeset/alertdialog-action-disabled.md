---
'@astryxdesign/core': patch
---

[feat] AlertDialog and useImperativeAlertDialog take `isActionDisabled`. The action button shows the disabled look and cannot be activated, while Cancel and Escape still work. Use it for a confirmation that waits on the person, such as an unchecked "I understand" box, or on other work. `isActionLoading` stays for the action's own work in progress.

@nynexman4464
