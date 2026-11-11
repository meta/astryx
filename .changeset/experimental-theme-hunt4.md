---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: the fourth pass of fixes.

- The theme lock is the release cache's lock, renewed while a command runs, so a long build is never taken over from another computer or container. The lock and the part-data cache come from the same node_modules.
- `corners more` keeps the base theme's proportions, so no radius gets smaller. A step on a part starts from that part's own radius, and a size between rungs steps to the next rung. A group setting that covers an earlier part setting says so, and `show` marks the part setting as not shown.
- A word for a value names that value (`surfaces elevated` suggests raised). `how base` lists installed bases and names the rest with their install line. Values a property does not take (`display flexx`, `padding auto`) are refused. A plain value that replaces per-mode values says which it replaced.
- A base theme updated since the build is noticed, and the theme is built again. A folder where a file goes is refused. When React is missing, the refusal names the install line, and `show` writes nothing. The editor's own temp files left by a stopped command are removed.

@josephfarina
