---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: every command that builds or checks an editor theme says when its app copy in `src/themes/<theme>/` is behind: `compile` warns, `compile --check` fails while the copy is kept back or gone, and a `set` that changes nothing still carries `appCopyStale`. A link or a folder of yours at a copy file name stops the copy like a file of yours does, and a copy that cannot be written says why (not writable, disk full, a file where the folder goes). A copy whose descriptor was deleted is still the editor's and is written back. Compiling the copy's source takes the theme's lock and writes the copy again; with the copy gone it names `editor show`. Fonts the copy's font stylesheet loads are not called unloaded. The editor and compile help say the copy rule.

@josephfarina
