---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` reads a folder or file whose name begins with two dots (`..x`) as one inside the folder that holds it, where it took it for the folder above. The note at the top of a page rendered outside a project names the page by its path among the files it lists (`app/x/page.tsx`), where it named only the file (`page.tsx`) and pointed at it as the file to edit.

@josephfarina
