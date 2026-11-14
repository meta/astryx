---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render --reverse` gives back a page that imports files through a path alias (`@/components/Header`) in a folder whose project has no alias for those imports, such as an empty folder holding only the HTML file. A render records which carried file each alias import named; where no alias of the receiving project names the import, the file comes back in the page's own layout inside the new folder, byte for byte. The result's `aliased` names each such import with its file, the `paths` entries the page needs to build, and the tsconfig.json or jsconfig.json they belong in (the one TypeScript reads for the page, else a new one), and the text prints them. Only an import that cannot be a package name is followed this way (`@/`, `~/`, `#`), so a received file can never remap a package. Such a page used to be refused as carrying "files the page does not import". Where the project's alias points outside the new folder, the restore is still refused; a file from an older CLI, which records no alias imports, is still refused, now saying how to get it back.

@josephfarina
