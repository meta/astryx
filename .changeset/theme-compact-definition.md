---
'@astryxdesign/core': patch
---

[feat] `@astryxdesign/core/theme` exports the compact definition: `compactDefinition(widthBreakpoints?)` and `DEFAULT_COMPACT_DEFINITION`. A screen is compact while its viewport is narrower than the theme's `md` point (768 by default) or shorter than 500. The definition carries both edges and ready-made media queries, with and without a coarse pointer, so every component that picks a presentation by screen size reads one shared definition. Nothing changes behavior yet.

@cixzhang
