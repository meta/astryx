---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render --reverse` gives back a page that imports through a path alias in a project whose alias leads outside the new folder, instead of refusing it. When the file the alias reaches is byte for byte the page's copy, the page uses it and the copy is not written (`aliased.sameAsProject`), so render, reverse, edit and render again work in the page's own project, again and again. When that file differs or is not there, the page's copy comes back in its own layout inside the new folder, never into a folder that exists, and the answer names the file the alias reaches today (`aliased.differs`) with the `paths` entry that leads the import to the copy. A file from a CLI that recorded no alias imports gets the same `paths` entry, found from the carried file the import's path ends with. `aliased.config` and `aliased.paths` now appear only when `aliased.imports` is not empty.

@josephfarina
