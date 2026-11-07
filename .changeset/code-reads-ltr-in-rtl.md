---
'@astryxdesign/core': patch
'@astryxdesign/richtext': patch
---

[fix] Code reads left to right in a right-to-left page: `CodeBlock`'s code, inline `Code`, and RichText's inline and fenced code lay out left to right and isolated from the prose around them, so `const a = 1;` keeps its `;` at the line end on a Hebrew page. A caller `dir` on `Code` still wins.

@cixzhang
