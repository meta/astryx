---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: a theme with both modes gets a sheet and preview that render each part as the app renders it in each mode (a Toast in dark is the app's dark Toast, no longer a blank bar), the page showing the render of the mode it is in. From a workspace root, a folder in a workspace app gets that app's own checks (its routes folder, public/, build folder, themes/, Pages Router, unrouted folders); the pointers to an app below keep every argument (`--theme`, `--template`, `--top`) and use `--path` from a project root; a theme that a workspace app holds is named there, with the command run from that app. Every pointer is one its command takes: `preview add` only where add takes the folder, a starter folder free of any file, dangling link or case twin, a `cd` that a folder starting with `-` does not break, and `editor show <theme> --png` after a stop during the pictures. Starter apps get package names that never collide. A preview moved into a folder with a space or another character no plain URL takes is updated where it is. A second Ctrl-C while the pictures stop kills the browser at once and removes its temp folder.

@josephfarina
