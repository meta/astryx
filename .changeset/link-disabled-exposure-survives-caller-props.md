---
'@astryxdesign/core': patch
---

[fix] A disabled Link keeps its Tab stop and stays announced as disabled when the caller also passes `aria-disabled`, `role`, or `tabIndex`. Before, those caller props replaced Link's own, so `tabIndex={-1}` took a disabled link out of the Tab order and `aria-disabled={false}` announced it as enabled.

@cixzhang
