---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render --reverse` gives back a page that imports files through a path alias (`@/components/Header`) in a folder whose project has no alias for those imports, such as an empty folder holding only the HTML file. A render records which carried file each alias import named; where no alias of the receiving project names the import, the file comes back in the page's own layout inside the new folder, byte for byte. The result's `aliased` names each such import with its file, the whole `paths` the page needs to build (the entries the config has now, own or inherited, with every target the imports need), and the tsconfig.json or jsconfig.json it belongs in (the one TypeScript reads for the page, else a new one), and the text prints them. Only an import that cannot be a package name or a package's own subpath import is followed this way (`@/…`, `~/…`), so a received file can never remap a package or the reader's own imports. Such a page used to be refused as carrying "files the page does not import". Where the project's alias points outside the new folder, the restore is still refused; an import that looks like a package name (`@components/Header`), or a file from an older CLI, which records no alias imports, is still refused unless the receiving project has the alias, and the refusal now says so.

@josephfarina
