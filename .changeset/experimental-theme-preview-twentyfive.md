---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: popovers shown open on the Overview and Components pages no longer take focus, so the page stays where it opened. The Overview points to the Colors page only when the preview has one, and a color `set` on a theme whose preview has no Colors page says which `preview add` adds it. `preview remove` takes away the empty folders the preview's first `add` made, never one that was there before. The Overview reads its font line again when the theme changes while the page is open. The `preview app` starter lists `@types/node`, so its first `npm run dev` installs nothing.

@josephfarina
