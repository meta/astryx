---
'@astryxdesign/core': patch
---

[fix] RadioList: the radios of a group disabled without a `disabledMessage` stay in the tab order with `aria-disabled="true"`, as they already do with a reason, so keyboard and screen-reader users can still reach the group and hear that it is unavailable. Selection stays blocked and the group still submits no value. An individually disabled option keeps the native `disabled` attribute. These group radios no longer carry native `disabled`, so a `:disabled` selector or a `toBeDisabled()` assertion no longer matches them; use `[aria-disabled="true"]`.

@cixzhang
