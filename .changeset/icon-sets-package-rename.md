---
'@astryxdesign/cli': patch
---

[experimental] Icon sets: after you rename an icon-set package in package.json, the next `experimental icon` command that writes the data file (`new-set` on the existing set, with or without `--from`, `add`, `map`, or `new-definition --icon`, even one that changes nothing else) writes the new package name to the data file's `module`, and keeps any subpath (`@acme/old-icons/outline` becomes `@acme/new-icons/outline`). Before, the old name stayed, and `integration check` failed until you edited the file by hand. The receipt of each of these commands names the new and the old `module` (`Updated module to "@acme/new-icons/outline" (was "@acme/old-icons/outline"), from the package name in package.json.`), and `map` words each `map` entry from what it replaced, so an entry that did not change says so. Only the experimental icon commands and the icon-sets guide change.
@josephfarina
