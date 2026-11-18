---
'@astryxdesign/cli': patch
---

[experimental] Icon definitions: 28 definitions drop a word that only spelled one icon library's export name (for example `arrow path` on `refresh`, `arrow uturn left` on `undo`, `user plus` on `userAdd`), keeping the plain words people use for each meaning. An icon set's own icon names still match, because the finder reads export names as words.

@josephfarina
