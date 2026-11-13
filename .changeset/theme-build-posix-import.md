---
'@astryxdesign/cli': patch
---

[fix] On Windows, `astryx theme build` prints install snippets that import the built theme with a working path. The import path joined the output folder with backslashes and kept a stray one after the dropped `src/`, so the snippet read `import { oceanTheme } from './\themes\ocean/ocean';`, which is not a valid specifier (and `\t` is a tab in a JS string). It now reads `./themes/ocean/ocean` on every platform.

@prath47
