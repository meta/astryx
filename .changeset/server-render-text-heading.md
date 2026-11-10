---
'@astryxdesign/core': patch
---

[perf] Text and Heading render in React Server Components. Their modules no longer carry `'use client'`, so a Server Component that renders Text or Heading without `maxLines` ships no client JavaScript for them. An explicit `maxLines` renders a client part that clamps the lines, measures overflow and mounts the truncation tooltip, as before. In client components, Text and Heading render as before, and a change of `maxLines` or `hasTruncateTooltip` keeps the element and its children mounted. Imported from `@astryxdesign/core/Text` or `@astryxdesign/core/Heading`, they render on the server now; imported from the package root, they do so once the root entry is no longer a client module. No API changes.

@rhagigi @imdreamrunner
