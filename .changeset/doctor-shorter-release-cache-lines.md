---
'@astryxdesign/cli': patch
---

[feat] Two `astryx doctor` info messages say the same facts in fewer words. With no update check recorded, `newest-release` used to read "Update check: none recorded here, so the newest release is not known. Only a copy installed for the computer checks, in the background once a day after a command; …"; it now reads "Newest release unknown: no update check recorded here. Only a copy installed for the computer checks, daily in the background after a command; …". The `gather-cache` message keeps its list of what is kept word for word; its sentences on the CLI's build id, the lookup commands' not-found path and the size limit are folded into shorter clauses. Default `astryx doctor` text in a project with only Core installed is about 2.5% shorter. Check ids, statuses, fields, the JSON shape and exit codes do not change.
@josephfarina
