---
'@astryxdesign/core': patch
---

[feat] `Timestamp` takes a `timezoneID` prop naming the IANA zone its absolute formats render in, such as `'UTC'` or `'America/Los_Angeles'`. An explicit zone renders identically on the server and the client, so a server-rendered absolute time no longer depends on the server's zone and hydrates without a mismatch. Omit it (or pass `'local'`) to keep the viewer's own zone, relative formats ignore it, and an unknown identifier warns once in development and falls back to the viewer's zone.

@nbozidarevic
