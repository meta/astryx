---
'@astryxdesign/core': patch
---

[fix] A theme sets the room between a checkbox or a switch and its label with `gap` on the `checkbox-input` or `switch-field` target, for example `components: {'checkbox-input': {base: {gap: '3px'}}}`. Before, that gap sat on an inner row no target reaches, so the only way to change it was the `--spacing-2` token, which also changed the status message's padding. The default room stays 8px, and a hidden label still keeps no gap.

@josephfarina
