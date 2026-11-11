---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: a preview change stopped part way (a kill, a crash) is finished by the next `preview add` or `preview remove`. The change writes a step record before its first rename. The next command removes leftover temp files, records the preview's own files, keeps a page whose new file never landed at its old place, and says so in a note.

@josephfarina
