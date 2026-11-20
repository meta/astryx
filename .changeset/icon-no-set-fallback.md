---
'@astryxdesign/cli': patch
---

[experimental] With no icon set installed, `experimental icon` lists the built-in that draws in place of a matching definition Core does not draw, since Core draws only built-in names without a set: `question` now lists `info` before `help`. A built-in that the query also matches takes the better of its own place and that definition's place; one that only this brings comes after the built-ins that match, so `review check` still lists `check` first. A match ranked above it with no built-in to fall back to keeps it out: `settings` still lists `settings` first.
@josephfarina
