---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export --pictures` names each Table the phone picture draws more than 30% wider than it shows, so a phone reader has to swipe to find its last columns: one `wideTables` line in the Pictures section, with where the page draws the Table and the Table docs' advice for a page read on phones, and the same under `data.pictures.wideTables` in JSON. Without `--pictures` nothing changes.

@josephfarina
