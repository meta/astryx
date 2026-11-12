---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: the route and pages it writes type-check with `noUncheckedIndexedAccess`, `noImplicitOverride` and `noUnusedLocals`. `add --path` refuses a folder name that is no plain URL segment (a space, an accent, `#`, `%`), suggesting a slugged one. Folder names Windows does not allow are refused in full: reserved characters, a trailing dot or space, and `COM¹`-style device names. The free folder a URL conflict suggests is one whose URL no other page serves. `preview app` leaves out a temp file a stopped command left in the theme folder.

@josephfarina
