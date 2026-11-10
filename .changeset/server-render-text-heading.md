---
'@astryxdesign/core': patch
---

[perf] Text and Heading render in React Server Components. Their modules no longer carry `'use client'`, so in a Server Component they render on the server and the browser hydrates nothing for them. Only an explicit `maxLines` with the truncation tooltip on renders a client part, which measures overflow and mounts the tooltip, as before; a clamped Text with the tooltip off renders only a small part that tells a nested Link it is in clamped text. A bundler that loads only the client modules a page renders, such as webpack, loads none of their code for a page without truncation; one that loads every client module a page's server code imports, such as Turbopack, still loads the truncation part. Imported from `@astryxdesign/core/Text` or `@astryxdesign/core/Heading`, they render on the server now; imported from the package root, once the root entry is no longer a client module. A Server Component can no longer pass these `Text` or `Heading` themselves as a prop to a client component; import them in the client component instead. In client components, Text and Heading render as before, and a change of `maxLines` or `hasTruncateTooltip` keeps the element and its children mounted. No API changes.

@rhagigi @imdreamrunner
