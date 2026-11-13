---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: a default page's id beside another page asked for is refused ("drop one of them") instead of dropping the other. `preview add colors` on a theme with no generated colors says how to get them. `preview list` marks a page whose file is gone and notes a change that was stopped part way, and `add` writes a missing page back as added. Running a stopped `preview remove` again finishes it and exits 0. `basePath` is certain only when set as a literal on the exported config at the top of next.config; one set in an `if` or a function, deleted, or added by a wrapper is named as set from code.

@josephfarina
