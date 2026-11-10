---
'@astryxdesign/core': patch
---

[fix] The package root and the component barrels no longer carry `'use client'`. Inside a React Server Component, `import {Card, Stack, Badge, Code} from '@astryxdesign/core'` now renders the components that need no client code on the server, as their own modules intend; components that need the client stay client references. Client code renders the same as before. No API changes.

@imdreamrunner
