---
'@astryxdesign/core': patch
---

[fix] The package root and the component barrels no longer carry `'use client'`. Inside a React Server Component, `import {Card, Stack, Badge, Code} from '@astryxdesign/core'` now renders the components that need no client code on the server, as their own modules intend; components that need the client stay client references. A Server Component that imports from the package root now builds with Next.js webpack. Client code renders the same as before. No API changes. To pass one of these components itself as a prop to a Client Component (for example `components={{inlineCode: Code}}` on `Markdown`), pass it from a `'use client'` module.

@imdreamrunner
