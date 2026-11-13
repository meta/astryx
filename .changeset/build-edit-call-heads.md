---
'@astryxdesign/cli': patch
---

[fix] `astryx build` reads more change requests as changes: an idea that opens with a change word (such as "update", "add" or "fix") and refers to something that already exists ("the", "my", "existing" …) now starts on the app shell like other changes to an existing page, instead of from a page template. The change words are a fixed list in `kit/edit.heads.json`.

@josephfarina
