---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render --reverse` gives back a page that imports files through a path alias (`@/components/Header`) in any folder, not only inside a project whose alias points into the new folder. A render records which carried file each alias import named; where no alias of the receiving project names the import, the file comes back in the page's own layout inside the new folder, byte for byte, and the result names each such import with the file it came back as (`aliased`), and the text gives the `paths` entry the page needs to build. Such a page in a folder without the alias used to be refused as carrying "files the page does not import". Where the project's alias points outside the new folder, the restore is still refused; a file from an older CLI, which records no alias imports, is still refused, now saying how to get it back.

@josephfarina
