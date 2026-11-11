---
'@astryxdesign/core': patch
---

[fix] Button: a disabled or loading submit or reset Button, including one in a disabled ButtonGroup or InputGroup, no longer submits or resets its form when clicked in server-rendered HTML before the page hydrates or when JavaScript fails to load. It renders as a plain button until hydration, then takes its own type again, with no change to what people see or hear.

@cixzhang
