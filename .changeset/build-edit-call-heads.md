---
'@astryxdesign/cli': patch
---

[fix] `astryx build` reads more change requests as changes: an idea that opens with one of a fixed list of words (such as "update", "add" or "fix") and names an existing or current page or part ("fix the current settings page layout", "update my current dashboard") now starts on the app shell like other changes to an existing page, instead of from a page template. An idea that also names a new page ("a settings page", "a new analytics dashboard") still starts from that page. The words are a fixed list in `kit/edit.heads.json`.

@josephfarina
