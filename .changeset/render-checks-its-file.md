---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export` checks the file it wrote and says so: whether the file's markup and stylesheets load anything from outside the file (the page's own script is not read), and whether `--reverse` gives back every carried file exactly, naming any that differ (`data.checks` in JSON). When the file stands alone, it names it as the one file to share, with its size.

@josephfarina
