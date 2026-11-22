---
'@astryxdesign/core': patch
---

[fix] A popover, dialog or menu that closes while focus moves to another control no longer pulls focus back to its opener. With a day focused in one DateInput's calendar, a press on a second DateInput now leaves focus in the second field, so typing reaches it. Escape still returns focus to the opener.

@cixzhang
