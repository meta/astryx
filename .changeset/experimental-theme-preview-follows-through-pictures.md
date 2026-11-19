---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: pictures a plain Chrome took are no longer reported as "--png took no pictures"; the `see` line names `editor show <theme> --png` for pictures, never the command that just ran (an undo run again undoes another change); stopping a change while the browser takes pictures stops the browser and says the change is saved, never a browser failure; a picture's part file left by a stopped run is cleared by the next change and never copied into a new app, and a folder by that name is skipped; an in-app preview route that cannot be written, a damaged preview record and a preview in a folder Next does not serve (`src/app/` under a root `app/`, page extensions without `tsx`) are all said, with no URL that would not load; `preview app` copies none of a theme's pictures or preview pages; and from a subfolder, `preview list` and `remove` take the folder they print, and the picture note and `previewStale` name files the way `see` does (absolute).

@josephfarina
