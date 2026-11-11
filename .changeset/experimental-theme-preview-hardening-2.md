---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: safer refusals and recovery.

- No refusal suggests deleting or moving files: a damaged theme-preview.json, a page changed by hand, or a file in the way gets plain instructions instead.
- `--path` at the project root, in `src/` or at the routes folder itself is refused: those folders hold the app. An older preview found there is named, with the remove that clears it.
- A whole `remove` stops, deleting nothing, when `page.tsx` was changed by hand, since it imports the pages.
- A formatter run no longer counts as a change by hand. `editor set` and `show` name the preview files they left as they were (`previewStale`).
- A recorded page whose file is gone is written again, or left out of the nav, so the route always builds. Moved pages get a hash. A failed write leaves no temp file or empty folder, and says which step failed. A read-only file keeps its mode.
- `preview app --theme` waits for other commands changing that theme, and its retry suggestion keeps `--theme`.

@josephfarina
