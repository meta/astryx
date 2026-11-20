---
'@astryxdesign/cli': patch
---

[fix] In a project with no Next route folder, the page path that `astryx build` and `astryx template` name is now the file the copy writes (`src/pages/<id>.tsx`), not a folder holding `page.tsx`; a block's path is now its file (`app/components/<id>.tsx`, `components/<id>.tsx` or `src/components/<id>.tsx`) in every project. An import of the named path, such as `import Page from './pages/settings'`, now resolves, and a name an import already resolves to (a folder's index or a file with another extension) moves to `<id>-2`. Next App Router pages keep their route folder, and Pages Router pages were already files.

@josephfarina
