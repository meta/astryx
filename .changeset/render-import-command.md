---
'@astryxdesign/cli': patch
---

[experimental] New `astryx experimental import <file.html>` turns a file `astryx experimental export` wrote back into its page, the same as `export --reverse`, which keeps working. Help, the share and export guides, the file's own note and the render's suggestions now give the way back as `experimental import`. The JSON answer is unchanged (`render.reverse`). An old `experimental render --reverse` line now points straight to `experimental import`, and an unknown top-level `import`, `back`, `restore`, `unrender` or `reverse` suggests it without running it.

@josephfarina
