---
'@astryxdesign/cli': patch
---

[perf] In a project with an integration, `astryx` commands that read back what they kept (`component`, `search`, `template`, `docs`, `build` and others) finish about 10 ms sooner. A kept gather no longer checks the CLI's own files one by one: as the per-user cache record already says, the CLI's build id stands for them, and now so does the folder the CLI runs from, so a copy installed in another folder, such as a patched one, keeps its own entries. In-place edits to an installed CLI stay unsupported; deleting the per-user `astryx/catalogs` folder clears what was kept. A package in the node_modules folder inside the CLI's is still checked, as before. Output does not change, except `astryx doctor`'s cache row, which now names the folder beside the build id.

@josephfarina
