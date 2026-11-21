---
'@astryxdesign/cli': patch
---

[experimental] A page rendered with `astryx experimental render` carries one copy fewer of each image a page module imports (`import photo from './photo.png'`) when the file's embedded source carries it. The page's script reads such an image from the embedded source, so the script holds no copy of its own. An image the embedded source leaves out (under a dot-folder or in `node_modules`) keeps its own copy in the script, and an image the page names by a string path keeps its copy too.

@josephfarina
