---
'@astryxdesign/cli': patch
---

[feature] In a project whose CLI has `experimental export`, the agent block that `astryx init` writes says what to do when asked to share a page as one file: run `astryx experimental export <page.tsx>`; `--reverse` gets the source back. Asked to share a page as one file, agents built their own single HTML file instead; with the line, they export the page.

@josephfarina
