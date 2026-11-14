---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` and `--reverse` read a folder or file whose name begins with two dots (`..x`) as one inside the folder that holds it, where they took it for the folder above. A page in such a folder keeps its own folder as the root of the files it carries, so the file it writes reverses; a file above it stays out, named in a `not-embedded` warning. The note at the top of a page rendered outside a project names the page by its path among the files it lists (`app/x/page.tsx`), where it named only the file (`page.tsx`) and pointed at it as the file to edit.

@josephfarina
