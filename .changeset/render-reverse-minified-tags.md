---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render --reverse` finds the embedded source in a file whose tags were rewritten, as an HTML minifier does: the script tag's attributes in any order, quoted or not, in any letter case. Such a file used to come back as a page rebuilt from its markup (text and layout only) instead of the exact source. A tag spelled inside a comment or inside the text of another element still never counts.

@josephfarina
