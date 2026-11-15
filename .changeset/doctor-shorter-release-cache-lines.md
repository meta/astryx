---
'@astryxdesign/cli': patch
---

[feat] With no update check recorded, `astryx doctor`'s `newest-release` row reads "Newest release unknown: no update check recorded here. Only a copy installed for the computer checks, daily in the background after a command; a project's copy changes only when the project upgrades it; a tool running its own copy picks its release." The `gather-cache` row keeps its list of what is kept, and states the CLI's build id, the lookup commands' not-found path and the size limit in short clauses. Check ids, statuses, fields, the JSON shape and exit codes do not change.
@josephfarina
