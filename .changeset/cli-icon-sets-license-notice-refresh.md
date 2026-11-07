---
'@astryxdesign/cli': patch
---

[experimental] Icon sets: when a wrapped library ships no license file, `integration check` on an icon set, `experimental icon new-set --from`, and a refresh name the NOTICE file to add and where, and the icon-sets guide lists the file names that count. A refresh from a library root moves icons added one file at a time from that library to the root import, keeping their ids, exports, map entries, variants, and words, and the receipt lists them under `moved`. Each keeps that id and export on every later refresh, and refreshing again changes nothing. A refresh keeps an id you chose that is not a spelling of the library name (`dismiss` for `XIcon`), also for an icon that already reads the root; it renames only an id the current rule spells differently. A library icon whose id or name a moved icon already has is left out. An icon whose root export another icon of the set already reads stays on its own import, and the receipt says why. A variant from another file of the package, such as a solid look, stays on its own import, and every export the refresh does not write again stays in the generated module. A `LICENSE` directory counts as a license notice in neither the receipt nor the check.

@josephfarina
