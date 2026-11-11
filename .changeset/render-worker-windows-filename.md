---
'@astryxdesign/cli': patch
---

[fix] On Windows, a page render transforms the page's own files again. The render read every file as outside the project, because the module loader named files with forward slashes while the project path used backslashes, so no file was transformed. A page or theme that imported a stylesheet then failed with `Unknown file extension ".css"`, and StyleX, image and JSON imports were not handled either.

@prath47
