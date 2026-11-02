---
'@astryxdesign/core': patch
---

[fix] TextArea: the `maxLength` character counter now comes from one catalog message (`@astryx.textArea.counter`), so its numbers use the locale's number format and translators can change the order or separator. In English a limit of 1,000 or more now shows grouped digits (`62/2,000` instead of `62/2000`).

@cixzhang
