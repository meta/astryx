---
'@astryxdesign/cli': patch
---

[fix] Outside a Next App Router, the path that `astryx build` and `astryx template` name for a scaffolded page or block is now the file that gets written (`src/pages/<id>.tsx`, `src/components/<id>.tsx`), not a folder holding `page.tsx`. An import of the named path, such as `import Page from './pages/settings'`, now resolves. App Router pages keep their route folder.

@josephfarina
