---
'@astryxdesign/core': patch
---

[fix] A disabled Link stays announced as disabled, with its own role, when the caller also passes `aria-disabled` or `role`. Before, those caller props replaced Link's own, so `aria-disabled={false}` announced a disabled link as enabled, and `role="button"` announced a button that does nothing.

@cixzhang
