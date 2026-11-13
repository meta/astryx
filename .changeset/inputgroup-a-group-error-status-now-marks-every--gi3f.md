---
'@astryxdesign/core': patch
---

[fix] InputGroup: a group `error` status now marks every admitted input inside the group `aria-invalid`, so screen readers announce each field itself as invalid instead of only reading the detached status message through `aria-describedby`. Before, the group status reached grouped inputs only as description text and the inputs kept the browser's valid state unless they carried their own `error` status. Grouped inputs with their own `error` status, `warning` and `success` group and input statuses, addons, and inputs outside a group are unchanged.
@Abolfazlrwm
