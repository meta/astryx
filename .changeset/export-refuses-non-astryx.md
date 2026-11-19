---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export` refuses a page that uses no Astryx components or styles, with `ERR_RENDER_NOT_ASTRYX`, exit 1 and nothing written: "page.tsx uses no Astryx components or styles; `astryx experimental export` only writes pages built with Astryx. Don't add Astryx to this app to export it: share the page with the app's own build instead (for a Vite app, a single-file build); nothing was written." The page's own script decides: a page counts as Astryx when any module its script holds belongs to an Astryx package (imported directly, through a local component or a re-export, or lazily), or when it imports an Astryx stylesheet. The theme editor's previews are unchanged.

@josephfarina
