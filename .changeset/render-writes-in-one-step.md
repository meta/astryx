---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` and `--reverse` write in one step. A render writes the HTML file under a temporary name beside it, then gives it its name, so a reader or another run never finds half a file: two renders of one page to one file both succeed, where one could be refused because the file "already exists and was not written by a render". A restore writes its new folder the same way, so restores run at the same time each get a folder of their own, also when they restore with `--out` into folders under one new folder, where some were refused, and a restore stopped part-way leaves no folder behind, so the same command works again. A run stopped between its write and its rename leaves a hidden temporary file or folder, which the next run to the same place, on the same computer and in the same container or sandbox, removes once that run's process is gone. A render still never replaces an HTML file this user cannot write, and the file it replaces keeps its permission bits; it now needs to make a file in the HTML file's folder, so a folder this user cannot write is refused, and the refusal names it. Every copy a restore writes, except the page at its target, lands in the one new folder, including a copy of the page that a path alias places; such a copy outside it is refused with nothing written.

@josephfarina
