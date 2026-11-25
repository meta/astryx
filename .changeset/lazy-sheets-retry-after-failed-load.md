---
'@astryxdesign/core': patch
---

[fix] Popover, DropdownMenu, MoreMenu and ContextMenu bottom sheets: when the sheet's code fails to download (a dropped connection on a phone), the page keeps working. The open closes, so the trigger works again, and the next open downloads the sheet again. Before, one failed download broke the surrounding page for the rest of the session. Development builds warn once.

@cixzhang
