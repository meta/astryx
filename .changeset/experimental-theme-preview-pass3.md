---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: removes that never touch project files, and previews only where Next serves them.

- `remove` deletes only the route file, the record and recorded page files, and only when a recorded hash shows they are as the preview wrote them. Any other file the record names, and any file with no recorded hash, is kept and named.
- `add` refuses a folder that holds a package.json, a URL another page already serves, an app whose next.config leaves out `tsx` page files, `src/app/` while `app/` is what Next serves, and a folder outside the root layout. An app with its root layout in `[locale]/` gets the preview there.
- A template's needs come from its real imports, never words in comments or strings. A package the app does not name gets the command that adds it.
- A theme with no build is built only after every check passed, holding the theme's lock, with a note. An edit inside a string counts as a change by hand.
- `editor show` and `preview app` run when the lock folder cannot be written.
- A damaged record in a folder that holds the app names renaming the record. A record with a byte-order mark is read. `list` says when the theme is gone. Base themes count as package themes, installed or not. `--template` takes any case. `preview app` refuses `public/` and names Windows does not allow. An empty route group folder goes with the preview.

@josephfarina
